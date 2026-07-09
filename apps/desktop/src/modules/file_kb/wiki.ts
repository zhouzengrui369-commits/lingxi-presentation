/**
 * LLM Wiki 整理 — T-1.1
 *
 * 严格不用 RAG（PRD 硬约束）。直接把 importer 抽出的全文喂给 daemon
 * (/v1/chat)，让 LLM 整理出 wiki_kb 记录（标题 + 摘要 + 标签 + 关联文件）。
 *
 * 设计取舍：
 *   - 不在本地做 chunking / embedding / 向量检索（= RAG）
 *   - 走 daemon 抽象层，CLI 主调用 + API 兜底；daemon 不可达时降级本地启发式
 *   - 本地启发式保证 wiki 流程永不断（即使 daemon 没启），靠 import 文本的
 *     首行/高频词做兜底标题 + 标签
 *
 * 灵犀演示 · Phase 1 · T-1.1
 */

import { uuidv4 } from './storage.ts';
import type { FileImportRecord, WikiKbEntry } from './storage.ts';

export interface WikiOptions {
  /** daemon base URL（默认 http://127.0.0.1:<port>） */
  daemonUrl?: string;
  /** 超时毫秒（默认 30000，PRD AI 响应 ≤ 3s 时会失败 → 走兜底） */
  timeoutMs?: number;
  /** 强制走兜底（测试用，跳过 daemon 调用） */
  forceLocal?: boolean;
  /** 注入 HTTP fetch（测试 mock） */
  fetchImpl?: typeof fetch;
}

const DEFAULT_DAEMON_TIMEOUT_MS = 30000;

/**
 * 把 importer 的输出整理成 wiki 条目。
 *
 * 入口：importResult (含 text + meta + record)
 * 出口：WikiKbEntry（写 storage）
 */
export async function organizeToWiki(
  importResult: { record: FileImportRecord; text: string; meta: Record<string, unknown> },
  opts: WikiOptions = {},
): Promise<WikiKbEntry> {
  const { record, text } = importResult;

  // 调 daemon 整理；失败回退到本地启发式
  let llmResult: { title: string; summary: string; tags: string[]; confidence: number } | null = null;
  if (!opts.forceLocal) {
    try {
      llmResult = await callDaemonForWiki(record, text, opts);
    } catch (err) {
      // 兜底：本地启发式
      llmResult = null;
    }
  }

  if (!llmResult) {
    llmResult = localHeuristicWiki(record, text);
  }

  const entry: WikiKbEntry = {
    entry_id: uuidv4(),
    title: llmResult.title.slice(0, 200),
    summary: ensureSummaryLength(llmResult.summary, record),
    tags: dedupeTags(llmResult.tags).slice(0, 10),
    related_files: [record.file_id],
    created_at: new Date().toISOString(),
    confidence: clamp(llmResult.confidence, 0, 1),
  };

  return entry;
}

// ---- Daemon call ----

async function callDaemonForWiki(
  record: FileImportRecord,
  text: string,
  opts: WikiOptions,
): Promise<{ title: string; summary: string; tags: string[]; confidence: number }> {
  const url = (opts.daemonUrl || resolveDefaultDaemonUrl()).replace(/\/$/, '');
  const fetchImpl = opts.fetchImpl || (globalThis.fetch as typeof fetch);
  if (!fetchImpl) {
    throw new Error('no fetch available');
  }

  const prompt = buildWikiPrompt(record, text);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_DAEMON_TIMEOUT_MS);

  try {
    const resp = await fetchImpl(`${url}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: 800 }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      throw new Error(`daemon /v1/chat returned ${resp.status}`);
    }
    const data = (await resp.json()) as { content?: string; provider?: string };
    const content = data?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('daemon response missing content');
    }
    return parseWikiJson(content);
  } finally {
    clearTimeout(timer);
  }
}

function resolveDefaultDaemonUrl(): string {
  if (process.env.LINGXI_DAEMON_URL) return process.env.LINGXI_DAEMON_URL;
  if (process.env.LINGXI_DAEMON_PORT) {
    return `http://127.0.0.1:${process.env.LINGXI_DAEMON_PORT}`;
  }
  return 'http://127.0.0.1:15321'; // daemon 默认端口（daemon README）
}

function buildWikiPrompt(record: FileImportRecord, text: string): string {
  // 截断到 ~6k 字符避免超 prompt limit
  const snippet = text.length > 6000 ? `${text.slice(0, 6000)}\n…(truncated)` : text;
  return `你是一个知识整理助手。用户导入了一份本地文件，请你把它整理成一个 wiki 知识条目。

文件信息：
- 文件名：${record.name}
- 格式：${record.format}
- 大小：${record.size_bytes} 字节
- 状态：${record.status}

文件内容（已抽取的纯文本）：
\`\`\`
${snippet}
\`\`\`

请严格用以下 JSON 结构返回（不要 markdown 代码块包裹、不要多余文字）：
{
  "title": "≤ 30 字的中文标题",
  "summary": "100-300 字的中文摘要，覆盖关键事实/结论/数字",
  "tags": ["3-5 个中文标签"],
  "confidence": 0.0-1.0 的浮点数（你对整理结果的可信度）
}

要求：
1. 标题必须 ≤ 30 字、必须中文、不要文件名
2. 摘要必须 ≥ 50 字、≤ 1000 字；如原文是英文请翻译为中文摘要
3. tags 至少 1 个、至多 10 个；中文或英文均可，但必须能反映内容主题
4. 不要编造原文中没有的数字/事实；置信度按信息量给（短文 0.5-0.7，长文 0.7-0.95）
5. 如果文本为空或太短（如 < 30 字），title 用文件名主标题，summary 用"待补全：内容过短"，confidence=0.3`;
}

/** 解析 daemon 返回的 JSON（容忍 markdown 代码块包裹 + 前后废话） */
function parseWikiJson(content: string): { title: string; summary: string; tags: string[]; confidence: number } {
  let json = content.trim();
  // 剥 markdown ```json ... ``` 包裹
  const mdMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) json = mdMatch[1].trim();
  // 找首个 { 和末个 }
  const first = json.indexOf('{');
  const last = json.lastIndexOf('}');
  if (first < 0 || last < 0 || last <= first) {
    throw new Error('no JSON object found in daemon response');
  }
  json = json.slice(first, last + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`wiki JSON parse failed: ${(err as Error).message}`);
  }

  const p = parsed as Record<string, unknown>;
  const title = typeof p.title === 'string' ? p.title : '';
  const summary = typeof p.summary === 'string' ? p.summary : '';
  const tagsRaw = Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string') : [];
  const confidence = typeof p.confidence === 'number' ? p.confidence : 0.5;

  if (!title) throw new Error('wiki JSON missing title');
  if (!summary) throw new Error('wiki JSON missing summary');

  return { title, summary, tags: tagsRaw, confidence };
}

// ---- Local heuristic fallback ----

/**
 * 本地启发式 wiki 整理（daemon 不可达 / mock 返回非 JSON 时兜底）。
 * 不调 LLM，只做：
 *   - title: 文件名去掉扩展名；或文本第一行
 *   - summary: 文本前 400 字符 + 字符数 + 段落数
 *   - tags: 文件 format + 文本中的高频词
 *   - confidence: 0.4 (固定)
 */
function localHeuristicWiki(
  record: FileImportRecord,
  text: string,
): { title: string; summary: string; tags: string[]; confidence: number } {
  const baseName = record.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const firstLine = text.split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0) ?? '';
  const title = (firstLine.length > 0 && firstLine.length <= 30 ? firstLine : baseName).slice(0, 30);

  const summaryBase = text.length > 0 ? text.slice(0, 400) : '（无文本内容，仅元数据）';
  const summary =
    summaryBase.length >= 50
      ? `${summaryBase}（共 ${text.length} 字符，来源：${record.format} 文件）`
      : `本条目由本地启发式生成：来源文件 ${record.name}（${record.format}，${record.size_bytes} 字节）。原文较短或抽取失败，待 LLM 在线时补全。`.slice(
          0,
          1000,
        );

  const tags: string[] = [record.format.toUpperCase()];
  if (text.length > 100) {
    // 抽 2-3 个高频词（中文 2-gram + 英文 word）
    const words = extractFrequentTokens(text, 3);
    tags.push(...words);
  }

  return {
    title: title || `${record.format} 文件 ${record.name}`,
    summary,
    tags,
    confidence: 0.4,
  };
}

function extractFrequentTokens(text: string, count: number): string[] {
  const freq = new Map<string, number>();
  // 中文 2-gram
  const cnRe = /[\u4e00-\u9fa5]{2,8}/g;
  let m: RegExpExecArray | null;
  while ((m = cnRe.exec(text)) !== null) {
    const k = m[0];
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  // 英文 word
  const enRe = /\b[A-Za-z]{4,}\b/g;
  while ((m = enRe.exec(text)) !== null) {
    const k = m[0].toLowerCase();
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  // 排除常见停用词
  const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'are', 'was', 'were', 'will', 'your', 'you', 'our', '他们的', '这个', '那个', '可以', '应该', '需要', '我们', '以及', '相关', '包括', '其中']);
  for (const k of STOP) freq.delete(k);

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([k]) => k);
}

function ensureSummaryLength(summary: string, record: FileImportRecord): string {
  // schema 要求 summary ≥ 50 字符 ≤ 1000
  if (summary.length < 50) {
    const pad = `（补全：来源文件 ${record.name}，格式 ${record.format}，大小 ${record.size_bytes} 字节）`;
    return (summary + pad).slice(0, 1000);
  }
  return summary.slice(0, 1000);
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const k = t.trim();
    if (!k) continue;
    if (k.length > 64) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
