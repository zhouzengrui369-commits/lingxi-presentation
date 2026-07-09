/**
 * 复杂改动入口 —— 回 AI 重新生成（T-1.4 · PRD 3.4）
 * 灵犀演示 · Phase 1
 *
 * 职责：轻量编辑搞不定的复杂改动（重排逻辑 / 换叙事 / 补内容），点"重做"按钮回 AI。
 *   调 T-1.0.a daemon 的 POST /v1/chat，把 advisor（T-1.2）拿到的新需求 + 当前预览
 *   一起喂给 LLM，产出新的 sections → 组装成 schema-valid 的 PreviewPage。
 *
 * 共享契约：
 *   - T-1.0.a daemon: POST /v1/chat  { prompt } → { content, provider, fell_back, elapsed_ms }
 *   - T-1.0.c schema: 产出严格匹配 preview_page.schema.json
 *   - T-1.2 advisor（未 merge）: requirement 文本先由调用方 mock 传入
 */
import type { PreviewPage, PreviewSection, TemplateStyle } from './types';
import { buildPreviewPage } from './renderer';

/** 可注入的 fetch（测试用 mock；运行时默认 globalThis.fetch） */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: any;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }>;

export interface ReviseParams {
  /** 用户的新需求（来自 advisor 交互，MVP 阶段由调用方传入） */
  requirement: string;
  /** 当前预览页（可选，作为 LLM 重做的上下文） */
  currentPage?: PreviewPage;
  /** daemon base url，如 http://127.0.0.1:38890 */
  daemonBaseUrl: string;
  /** 注入 fetch（缺省 globalThis.fetch） */
  fetchImpl?: FetchLike;
  /** 渲染主题（缺省内置简约商务） */
  style?: TemplateStyle;
  /** 引用的 KB 条目 */
  kbEntryIds?: string[];
  /** 超时 ms（缺省 15000，PRD 硬指标 10s + 容错） */
  timeoutMs?: number;
}

export interface ReviseResult {
  /** 新预览页（schema-valid） */
  page: PreviewPage;
  /** 端到端延迟 ms（round-trip，用于 PRD ≤10s 校验） */
  latency_ms: number;
  /** daemon 元信息 */
  provider: string;
  fell_back: boolean;
}

/** 构造重做 prompt：指示 LLM 输出结构化 JSON sections */
export function buildRevisePrompt(requirement: string, current?: PreviewPage): string {
  const ctx = current
    ? `\n\n【当前预览章节】\n${current.sections
        .map((s, i) => `${i + 1}. ${s.heading}`)
        .join('\n')}`
    : '';
  return `你是办公内容生成助手。请根据用户的新需求，重新生成一份汇报预览的结构化内容。

【用户新需求】
${requirement}${ctx}

【输出要求】
- 只输出一个 JSON 对象，不要任何解释、不要 markdown 代码围栏。
- 格式严格如下：
{"sections":[{"heading":"章节标题","content_html":"<p>正文HTML</p>","image_urls":[]}]}
- sections 至少 1 个，heading 为纯文本，content_html 为合法 HTML 片段。`;
}

/**
 * 从 LLM 返回内容里解析出 sections。
 * 容错策略：
 *   1. 优先提取首个 {...} JSON 块并解析 sections。
 *   2. 解析失败 / 无 sections → 退化为把整段内容包成单个章节（不丢内容）。
 */
export function parseSectionsFromContent(
  content: string,
  fallbackHeading = '重新生成的内容',
): PreviewSection[] {
  const tryParse = (text: string): PreviewSection[] | null => {
    try {
      const obj = JSON.parse(text);
      const arr = Array.isArray(obj) ? obj : obj.sections;
      if (!Array.isArray(arr) || arr.length < 1) return null;
      const sections: PreviewSection[] = arr
        .map((s: any) => ({
          heading: String(s.heading ?? '').trim() || fallbackHeading,
          content_html: String(s.content_html ?? s.content ?? '').trim() || '<p></p>',
          image_urls: Array.isArray(s.image_urls)
            ? s.image_urls.filter((u: any) => typeof u === 'string')
            : [],
        }))
        .filter((s: PreviewSection) => s.heading.length > 0);
      return sections.length > 0 ? sections : null;
    } catch {
      return null;
    }
  };

  // 1. 直接整体解析
  let parsed = tryParse(content.trim());
  if (parsed) return parsed;

  // 2. 提取首个 { ... } 块（应对模型加了前后缀）
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    parsed = tryParse(content.slice(start, end + 1));
    if (parsed) return parsed;
  }

  // 3. 退化：整段内容作为单章节，换行转 <p>
  const paragraphs = content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  const html =
    paragraphs.length > 0
      ? paragraphs.map(p => `<p>${escapeText(p)}</p>`).join('')
      : `<p>${escapeText(content.trim() || '（空）')}</p>`;
  return [{ heading: fallbackHeading, content_html: html, image_urls: [] }];
}

function escapeText(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 复杂改动主入口：回 AI 重新生成预览页。
 *
 * @returns ReviseResult（含新 PreviewPage + round-trip 延迟）
 * @throws  daemon 非 2xx / 网络错误 / 超时
 */
export async function reviseWithAI(params: ReviseParams): Promise<ReviseResult> {
  const {
    requirement,
    currentPage,
    daemonBaseUrl,
    style,
    kbEntryIds,
    timeoutMs = 15000,
  } = params;
  const doFetch: FetchLike =
    params.fetchImpl ?? ((globalThis as any).fetch as FetchLike);
  if (!doFetch) {
    throw new Error('reviseWithAI: 无可用 fetch 实现');
  }
  if (!requirement || !requirement.trim()) {
    throw new Error('reviseWithAI: requirement 不能为空');
  }

  const url = `${daemonBaseUrl.replace(/\/+$/, '')}/v1/chat`;
  const prompt = buildRevisePrompt(requirement, currentPage);

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  const started = Date.now();
  let resp;
  try {
    resp = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller?.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`reviseWithAI: daemon 返回 ${resp.status} ${detail}`);
  }
  const data = await resp.json();
  const latency_ms = Date.now() - started;

  const sections = parseSectionsFromContent(String(data.content ?? ''));
  const page = buildPreviewPage(sections, {
    templateId: style?.template_id ?? null,
    kbEntryIds: kbEntryIds ?? currentPage?.kb_entry_ids ?? [],
    latencyMs: latency_ms,
    style,
    previewId: currentPage?.preview_id, // 重做保留同一 preview_id（原地更新）
  });

  return {
    page,
    latency_ms,
    provider: String(data.provider ?? 'unknown'),
    fell_back: Boolean(data.fell_back),
  };
}
