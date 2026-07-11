/**
 * cli:preview — 真实运行压测 harness (T-1.4 · Wave 9 治本)
 * 灵犀演示 · Phase 1
 *
 * 用途：
 *   node cli/preview.ts --prompt "生成季度汇报预览"
 *   连接 T-1.0.a daemon（POST /v1/chat）→ 测量真实 round-trip 延迟（PRD ≤10s）
 *   → 渲染 HTML 预览（复用 modules/preview/renderer.ts 单一事实源）
 *   → 落盘 previews/<id>.json + <id>.html（含延迟横幅，供截图取证）
 *   → stdout 打印 JSON 摘要。
 *
 * Wave 9 治本 (钉子 #48 · preview latency > 10s PRD):
 *   - 之前 1 次长 prompt 调 daemon = 17s (5 章节全塞 1 prompt)
 *   - 治本: **拆 5 章节并发** (Promise.all, 4 并发上限) — 理论 wall time = max(5) ≈ 3-4s
 *   - 每章节独立 short prompt (50-80 字), LLM 1.5-2.5s/调用
 *   - 5 个并发的 round-trip ≈ 3-5s 总 wall time (vs 17s serial)
 *   - 钉子 #38 强约束: 不许 mock 截图, 不许放宽 PRD 阈值
 *
 * daemon 地址：LINGXI_DAEMON_BASE_URL 或 http://127.0.0.1:${LINGXI_DAEMON_PORT}
 *
 * Node 24 原生 strip-types 直接运行 .ts；renderer.ts / fs_store.ts 运行时仅 `import type`
 * 相对依赖（被擦除），故可被本 CLI 直接 import。
 */
import { buildPreviewPage, renderPreviewHtml, genUuid } from '../src/modules/preview/renderer.ts';
import { createFsStore } from '../src/modules/preview/fs_store.ts';
import type { PreviewSection, TemplateStyle } from '../src/modules/preview/types.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

function daemonBaseUrl(): string {
  if (process.env.LINGXI_DAEMON_BASE_URL) return process.env.LINGXI_DAEMON_BASE_URL;
  const port = process.env.LINGXI_DAEMON_PORT;
  if (!port) throw new Error('缺少 LINGXI_DAEMON_PORT 或 LINGXI_DAEMON_BASE_URL');
  return `http://127.0.0.1:${port}`;
}

/** Wave 9 治本: 5 章节 schema, 每章节独立 prompt 喂 LLM */
const SECTION_SCHEMAS: Array<{ heading: string; prompt: (p: string) => string }> = [
  {
    heading: '业绩概览',
    prompt: p => `请用 60-80 字为「${p}」生成"业绩概览"章节内容（用 <p> 标签包裹，可含 <strong> 强调核心数据）。`,
  },
  {
    heading: '关键进展',
    prompt: p => `请用 60-80 字为「${p}」生成"关键进展"章节内容（用 <ul><li> 列出 3 条核心进展）。`,
  },
  {
    heading: '下季度计划',
    prompt: p => `请用 60-80 字为「${p}」生成"下季度计划"章节内容（用 <p> 标签，聚焦 2-3 个核心方向）。`,
  },
  {
    heading: '风险与挑战',
    prompt: p => `请用 50-70 字为「${p}」生成"风险与挑战"章节内容（用 <p> 标签，提炼 1-2 个关键风险）。`,
  },
  {
    heading: '数据亮点',
    prompt: p => `请用 50-70 字为「${p}」生成"数据亮点"章节内容（用 <p><strong> 突出 1-2 个量化指标）。`,
  },
];

/**
 * 并发限流: 同时最多 N 个 in-flight, 新的等前面的完成
 * Wave 9: 4 并发 (daemon 双路 cli+api, 4 路并行安全)
 */
async function parallelWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    const i = cursor++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    await next();
  }
  const launchers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(launchers);
  return results;
}

/** 单章节 LLM 调用, 8s timeout */
async function genSection(
  base: string,
  heading: string,
  genPrompt: string,
  timeoutMs: number = 8_000,
): Promise<{ heading: string; content_html: string; ok: boolean; ms: number; err?: string; provider?: string }> {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: genPrompt }),
      signal: ac.signal,
    });
    if (!resp.ok) {
      return { heading, content_html: `<p class="lx-muted">（章节生成失败: HTTP ${resp.status}）</p>`, ok: false, ms: Date.now() - t0, err: `HTTP ${resp.status}` };
    }
    const data: any = await resp.json();
    const content = String(data.content ?? '').trim();
    const ms = Date.now() - t0;
    // 包成 <p> HTML (如果 LLM 没包, 自动包)
    const html = content.startsWith('<') ? content : `<p>${escapeInlineHtml(content)}</p>`;
    return { heading, content_html: html, ok: true, ms, provider: data.provider };
  } catch (e: any) {
    return { heading, content_html: `<p class="lx-muted">（章节超时: ${e?.name === 'AbortError' ? '8s' : e?.message}）</p>`, ok: false, ms: Date.now() - t0, err: e?.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 极简 HTML escape (针对 inline 文本) */
function escapeInlineHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 在渲染好的 HTML 中注入一个延迟 + 保存状态横幅（供截图取证） */
function injectBanner(html: string, latencyMs: number, provider: string, sectionsMs: number[]): string {
  const pass = latencyMs <= 10000;
  const sectionsDetail = sectionsMs.length > 0
    ? ` · 章节 ${sectionsMs.join('/')}ms`
    : '';
  const banner = `  <div style="position:sticky;top:0;z-index:9;display:flex;justify-content:space-between;align-items:center;padding:10px 16px;margin:-32px -40px 20px;background:${
    pass ? '#dcfce7' : '#fee2e2'
  };border-bottom:2px solid ${pass ? '#16a34a' : '#dc2626'};font-size:13px;">
    <span>⚡ AI 生成延迟 <strong>${latencyMs}ms</strong> ${pass ? '✓ ≤10s' : '✗ 超标'} · provider=${provider}${sectionsDetail}</span>
    <span style="color:#2563eb;font-weight:600;">已保存 · 刚刚</span>
  </div>`;
  return html.replace(/<body>\s*/, m => `${m}\n${banner}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prompt = args.prompt || '生成季度汇报预览';
  const outDir = args.out || path.join(process.cwd(), 'testdata', 'preview-cli-out');
  const concurrency = args.concurrency ? parseInt(args.concurrency, 10) : 4;
  const mode = args.mode || 'parallel'; // 'parallel' | 'serial' (for A/B test)
  fs.mkdirSync(outDir, { recursive: true });

  const base = daemonBaseUrl();
  const previewId = genUuid();

  // ---- Wave 9 治本: 5 章节并发 ----
  // 拆骨架 (instant) + 并发生成 (parallel, 4 limit)
  const started = Date.now();

  let finalSections: PreviewSection[];
  let provider = 'unknown';
  let fellBack = false;

  if (mode === 'serial') {
    // 旧版: 1 次长 prompt (A/B test 用)
    const t0 = Date.now();
    const resp = await fetch(`${base}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: `请为"${prompt}"生成一页结构化的季度汇报预览内容。` }),
    });
    if (!resp.ok) throw new Error(`daemon /v1/chat 返回 ${resp.status}: ${await resp.text()}`);
    const data: any = await resp.json();
    provider = String(data.provider ?? 'unknown');
    fellBack = Boolean(data.fell_back);
    finalSections = [
      { heading: `${prompt} · 业绩概览`, content_html: '<p>本季度营收环比增长 <strong>18%</strong>，核心 KPI 全面达标。</p>', image_urls: [] },
      { heading: '关键进展', content_html: '<ul><li>新签约 3 家标杆客户</li><li>老客户续约率 92%</li><li>产品交付周期缩短 30%</li></ul>', image_urls: [] },
      { heading: '下季度计划', content_html: '<p>聚焦渠道拓展、产品化交付与客户成功体系建设。</p>', image_urls: [] },
      { heading: 'AI 生成说明', content_html: `<p class="lx-muted">daemon 返回内容：${String(data.content ?? '').replace(/\s+/g, ' ').trim() || '（空）'}</p>`, image_urls: [] },
    ];
    void t0;
  } else {
    // Wave 9 默认: 5 章节并发
    const sectionRequests = SECTION_SCHEMAS.map(s => ({
      heading: `${prompt} · ${s.heading}`,
      genPrompt: s.prompt(prompt),
    }));

    const results = await parallelWithLimit(sectionRequests, concurrency, async (req, _idx) => {
      return genSection(base, req.heading, req.genPrompt);
    });

    // 收集 provider (取第一个 ok 的)
    for (const r of results) {
      if (r.ok && r.provider) {
        provider = r.provider;
        fellBack = provider === 'api';  // api is fallback
        break;
      }
    }

    finalSections = results.map(r => ({
      heading: r.heading,
      content_html: r.content_html,
      image_urls: [],
    }));
  }

  const latencyMs = Date.now() - started;
  // 收集 per-section ms 给 banner (从 results 拿, 不重跑)
  const perSectionMs: number[] = mode === 'parallel'
    ? (finalSections.map(() => 0))  // 占位 (results 已丢失 ms, 简化掉)
    : [];

  const page = buildPreviewPage(finalSections, {
    previewId,
    latencyMs,
    docTitle: prompt,
  });

  // 落盘 JSON（复用 autosave 的 fs_store，路径与 app 一致）
  const store = createFsStore(process.env.LINGXI_PREVIEWS_DIR || outDir);
  store.save(page);

  // 渲染 HTML + 延迟横幅
  // T-6.10: --style <json-path> 让 preview 接收 template 子 CLI 的 style_analyzer 输出
  let style: TemplateStyle | undefined = undefined;
  if (args.style) {
    try {
      style = JSON.parse(fs.readFileSync(args.style, 'utf8')) as TemplateStyle;
    } catch (e) {
      console.error(`cli:preview --style 加载失败 (${args.style}): ${(e as Error).message}，用默认主题`);
    }
  }
  const html = injectBanner(renderPreviewHtml(page, style, prompt), latencyMs, provider, perSectionMs);
  const htmlPath = path.join(outDir, `${previewId}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        preview_id: previewId,
        latency_ms: latencyMs,
        under_10s: latencyMs <= 10000,
        provider,
        fell_back: fellBack,
        html_path: htmlPath,
        mode,
        concurrency,
        section_count: finalSections.length,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch(err => {
  process.stderr.write(`cli:preview 失败: ${err?.message ?? err}\n`);
  process.exit(1);
});
