/**
 * 通用测试 fixture — 构造一个最小的 PreviewPage-like 结构（5 章节）
 */

import type { ExportPayload } from '../types';

export const DEFAULT_STYLE = {
  theme: 'light' as const,
  palette: {
    primary: '#2563eb',
    secondary: '#0ea5e9',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    muted: '#64748b',
  },
  fonts: {
    heading: '"PingFang SC", "Microsoft YaHei", sans-serif',
    body: '"PingFang SC", "Microsoft YaHei", sans-serif',
  },
};

export function makePayload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    doc_title: '2026 Q3 季度汇报 · 灵犀演示',
    preview_id: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
    style: DEFAULT_STYLE,
    sections: [
      {
        heading: '执行摘要',
        content_html:
          '<p>本季度营收 <strong>1.2 亿</strong>，同比 <em>+45%</em>。</p><p>新签客户 18 家，覆盖制造、零售、金融三大行业。</p>',
        image_urls: [],
      },
      {
        heading: '关键指标',
        content_html:
          '<p>ARR：<strong>4.8 亿</strong></p><ul><li>NDR 130%</li><li>毛利率 78%</li><li>客户数 220+</li></ul>',
        image_urls: [],
      },
      {
        heading: '产品迭代',
        content_html:
          '<p>T-1.1 file-kb、T-1.2 advisor、T-1.3 template、T-1.4 preview 已全部合并 main。</p><p>T-1.5 多格式输出为 Phase 1 收官。</p>',
        image_urls: [],
      },
      {
        heading: '风险与挑战',
        content_html:
          '<p>主要风险：双平台打包资源占用、CLI 在 Windows 上路径/编码。</p><p>缓解：HTTP daemon 隔离 CLI 进程；Phase 3 优先跑 Win 端到端。</p>',
        image_urls: [],
      },
      {
        heading: '下季度规划',
        content_html:
          '<p>Phase 2 端到端集成；Phase 3 macOS + Win 双平台；Phase 4 北极星 10 次 demo 零失败。</p>',
        image_urls: [],
      },
    ],
    ...overrides,
  };
}

/** 构造一个与 preview 模块渲染输出一致的 sourceHtml（5 章节） */
export function makeSourceHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light" data-template="builtin">
<head>
  <meta charset="utf-8" />
  <title>2026 Q3 季度汇报 · 灵犀演示</title>
  <style>
    body { margin: 0; padding: 32px; font-family: "PingFang SC", sans-serif; line-height: 1.7; color: #0f172a; background: #ffffff; }
    .lx-doc-title { font-size: 28px; color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 12px; }
    .lx-section { background: #f8fafc; border-radius: 12px; padding: 20px 24px; margin-bottom: 18px; }
    .lx-heading { font-size: 20px; color: #0f172a; }
    .lx-content { font-size: 15px; }
  </style>
</head>
<body>
  <main class="lx-preview">
    <h1 class="lx-doc-title">2026 Q3 季度汇报 · 灵犀演示</h1>
    <section class="lx-section"><h2 class="lx-heading">执行摘要</h2><div class="lx-content"><p>本季度营收 <strong>1.2 亿</strong>。</p></div></section>
    <section class="lx-section"><h2 class="lx-heading">关键指标</h2><div class="lx-content"><p>ARR：<strong>4.8 亿</strong></p></div></section>
    <section class="lx-section"><h2 class="lx-heading">产品迭代</h2><div class="lx-content"><p>T-1.1 / T-1.2 / T-1.3 / T-1.4 已合并。</p></div></section>
    <section class="lx-section"><h2 class="lx-heading">风险与挑战</h2><div class="lx-content"><p>双平台打包资源占用。</p></div></section>
    <section class="lx-section"><h2 class="lx-heading">下季度规划</h2><div class="lx-content"><p>Phase 2 / 3 / 4 推进。</p></div></section>
  </main>
</body>
</html>`;
}