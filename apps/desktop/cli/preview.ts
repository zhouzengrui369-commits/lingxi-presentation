/**
 * cli:preview — 真实运行压测 harness（T-1.4）
 * 灵犀演示 · Phase 1
 *
 * 用途：
 *   node cli/preview.ts --prompt "生成季度汇报预览"
 *   连接 T-1.0.a daemon（POST /v1/chat）→ 测量真实 round-trip 延迟（PRD ≤10s）
 *   → 渲染 HTML 预览（复用 modules/preview/renderer.ts 单一事实源）
 *   → 落盘 previews/<id>.json + <id>.html（含延迟横幅，供截图取证）
 *   → stdout 打印 JSON 摘要。
 *
 * daemon 地址：LINGXI_DAEMON_BASE_URL 或 http://127.0.0.1:${LINGXI_DAEMON_PORT}
 *
 * Node 24 原生 strip-types 直接运行 .ts；renderer.ts / fs_store.ts 运行时仅 `import type`
 * 相对依赖（被擦除），故可被本 CLI 直接 import。
 */
import { buildPreviewPage, renderPreviewHtml, genUuid } from '../src/modules/preview/renderer.ts';
import { createFsStore } from '../src/modules/preview/fs_store.ts';
import type { PreviewSection } from '../src/modules/preview/types.ts';
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

/** 构造一份季度汇报预览的章节（AI 内容 + 结构化骨架） */
function buildSections(prompt: string, aiContent: string): PreviewSection[] {
  const clean = aiContent.replace(/\s+/g, ' ').trim();
  return [
    {
      heading: `${prompt} · 业绩概览`,
      content_html:
        '<p>本季度营收环比增长 <strong>18%</strong>，核心 KPI 全面达标。</p>',
      image_urls: [],
    },
    {
      heading: '关键进展',
      content_html:
        '<ul><li>新签约 3 家标杆客户</li><li>老客户续约率 92%</li><li>产品交付周期缩短 30%</li></ul>',
      image_urls: [],
    },
    {
      heading: '下季度计划',
      content_html: '<p>聚焦渠道拓展、产品化交付与客户成功体系建设。</p>',
      image_urls: [],
    },
    {
      heading: 'AI 生成说明',
      content_html: `<p class="lx-muted">daemon 返回内容：${clean || '（空）'}</p>`,
      image_urls: [],
    },
  ];
}

/** 在渲染好的 HTML 中注入一个延迟 + 保存状态横幅（供截图取证） */
function injectBanner(html: string, latencyMs: number, provider: string): string {
  const pass = latencyMs <= 10000;
  const banner = `  <div style="position:sticky;top:0;z-index:9;display:flex;justify-content:space-between;align-items:center;padding:10px 16px;margin:-32px -40px 20px;background:${
    pass ? '#dcfce7' : '#fee2e2'
  };border-bottom:2px solid ${pass ? '#16a34a' : '#dc2626'};font-size:13px;">
    <span>⚡ AI 生成延迟 <strong>${latencyMs}ms</strong> ${pass ? '✓ ≤10s' : '✗ 超标'} · provider=${provider}</span>
    <span style="color:#2563eb;font-weight:600;">已保存 · 刚刚</span>
  </div>`;
  return html.replace(/<body>\s*/, m => `${m}\n${banner}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prompt = args.prompt || '生成季度汇报预览';
  const outDir = args.out || path.join(process.cwd(), 'testdata', 'preview-cli-out');
  fs.mkdirSync(outDir, { recursive: true });

  const base = daemonBaseUrl();
  const genPrompt = `请为"${prompt}"生成一页结构化的季度汇报预览内容。`;

  const started = Date.now();
  const resp = await fetch(`${base}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: genPrompt }),
  });
  if (!resp.ok) {
    throw new Error(`daemon /v1/chat 返回 ${resp.status}: ${await resp.text()}`);
  }
  const data: any = await resp.json();
  const latencyMs = Date.now() - started;

  const previewId = genUuid();
  const sections = buildSections(prompt, String(data.content ?? ''));
  const page = buildPreviewPage(sections, {
    previewId,
    latencyMs,
    docTitle: prompt,
  });

  // 落盘 JSON（复用 autosave 的 fs_store，路径与 app 一致）
  const store = createFsStore(process.env.LINGXI_PREVIEWS_DIR || outDir);
  store.save(page);

  // 渲染 HTML + 延迟横幅
  const html = injectBanner(
    renderPreviewHtml(page, undefined, prompt),
    latencyMs,
    String(data.provider ?? 'unknown'),
  );
  const htmlPath = path.join(outDir, `${previewId}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        preview_id: previewId,
        latency_ms: latencyMs,
        under_10s: latencyMs <= 10000,
        provider: data.provider ?? 'unknown',
        fell_back: Boolean(data.fell_back),
        html_path: htmlPath,
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
