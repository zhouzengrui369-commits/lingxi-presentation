/**
 * HTML 渲染器（T-1.4 · PRD 3.4）
 * 灵犀演示 · Phase 1
 *
 * 职责：基于 PreviewPage 结构（对齐 T-1.0.c preview_page.schema.json）+
 *       可选 TemplateStyle（T-1.3 风格 JSON）→ 渲染完整可预览的 HTML 文档。
 *
 * 设计约束：本文件运行时**无相对导入**（只 `import type`，被 Node/babel 完全擦除），
 *          因此 CLI 压测脚本可用 Node 原生 strip-types 直接复用此渲染逻辑（单一事实源）。
 */
import type { PreviewPage, PreviewSection, TemplateStyle } from './types';

/**
 * 内置简约商务主题（浅色）— 无模板 / T-1.3 未 merge 时的兜底。
 * PRD 3.3：无模板则用内置简约商务（浅/深双主题）。
 */
export const DEFAULT_TEMPLATE_STYLE: TemplateStyle = {
  template_id: null,
  theme: 'light',
  palette: {
    primary: '#2563eb',
    secondary: '#0ea5e9',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    muted: '#64748b',
  },
  fonts: {
    heading: '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
    body: '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
  },
  layout: 'simple-business',
};

/** 内置简约商务主题（深色） */
export const DARK_TEMPLATE_STYLE: TemplateStyle = {
  ...DEFAULT_TEMPLATE_STYLE,
  theme: 'dark',
  palette: {
    primary: '#60a5fa',
    secondary: '#38bdf8',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    muted: '#94a3b8',
  },
};

/** HTML 转义（用于标题等纯文本字段，content_html 已是 HTML 不转义） */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 渲染单个章节为 <section> 片段（editor 轻量编辑的 DOM 锚点：data-section-index） */
export function renderSection(section: PreviewSection, index: number): string {
  const images = (section.image_urls || [])
    .map(
      url =>
        `<img class="lx-img" src="${escapeHtml(url)}" alt="${escapeHtml(
          section.heading,
        )}" loading="lazy" />`,
    )
    .join('\n      ');
  const imageBlock = images ? `\n      <div class="lx-images">${images}</div>` : '';
  return `    <section class="lx-section" data-section-index="${index}">
      <h2 class="lx-heading" contenteditable="true" data-field="heading">${escapeHtml(
        section.heading,
      )}</h2>
      <div class="lx-content" contenteditable="true" data-field="content">${
        section.content_html
      }</div>${imageBlock}
    </section>`;
}

/** 由 palette/fonts 生成 <style> 内容 */
function renderStyle(style: TemplateStyle): string {
  const p = style.palette;
  return `    :root {
      --lx-primary: ${p.primary};
      --lx-secondary: ${p.secondary};
      --lx-bg: ${p.background};
      --lx-surface: ${p.surface};
      --lx-text: ${p.text};
      --lx-muted: ${p.muted};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 40px;
      background: var(--lx-bg);
      color: var(--lx-text);
      font-family: ${style.fonts.body};
      line-height: 1.7;
    }
    .lx-doc-title {
      font-family: ${style.fonts.heading};
      font-size: 28px;
      font-weight: 700;
      color: var(--lx-primary);
      margin: 0 0 24px;
      padding-bottom: 12px;
      border-bottom: 3px solid var(--lx-primary);
    }
    .lx-section {
      background: var(--lx-surface);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 18px;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .lx-heading {
      font-family: ${style.fonts.heading};
      font-size: 20px;
      font-weight: 600;
      color: var(--lx-text);
      margin: 0 0 10px;
    }
    .lx-content { font-size: 15px; color: var(--lx-text); }
    .lx-content p { margin: 0 0 10px; }
    .lx-muted { color: var(--lx-muted); }
    .lx-images { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .lx-img { max-width: 320px; border-radius: 8px; }
    [contenteditable="true"]:focus {
      outline: 2px solid var(--lx-secondary);
      outline-offset: 2px;
    }`;
}

/**
 * 渲染完整 HTML 文档。
 *
 * @param page  预览页结构（PreviewPage，sections ≥1）
 * @param style 模板风格（缺省用内置简约商务浅色主题）
 * @param docTitle 可选文档大标题（缺省用首章节标题）
 * @returns 完整 HTML 字符串（<!DOCTYPE html>...</html>）
 */
export function renderPreviewHtml(
  page: Pick<PreviewPage, 'sections'> & Partial<PreviewPage>,
  style: TemplateStyle = DEFAULT_TEMPLATE_STYLE,
  docTitle?: string,
): string {
  if (!page.sections || page.sections.length < 1) {
    throw new Error('renderPreviewHtml: sections 至少需要 1 个');
  }
  const title = docTitle ?? page.sections[0].heading;
  const sectionsHtml = page.sections
    .map((s, i) => renderSection(s, i))
    .join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${style.theme}" data-template="${
    style.template_id ?? 'builtin'
  }">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
${renderStyle(style)}
  </style>
</head>
<body>
  <main class="lx-preview" data-preview-id="${page.preview_id ?? ''}">
    <h1 class="lx-doc-title">${escapeHtml(title)}</h1>
${sectionsHtml}
  </main>
</body>
</html>`;
}

/** 生成 UUID v4（Node crypto.randomUUID / RN Hermes 均可用；无则退化到伪随机） */
export function genUuid(): string {
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 由章节列表构造一个完整 PreviewPage（渲染 html + 填充元数据）。
 * ai_revise / cli 复用：把 LLM 产出的 sections 组装成 schema-valid 的 PreviewPage。
 */
export function buildPreviewPage(
  sections: PreviewSection[],
  opts: {
    templateId?: string | null;
    kbEntryIds?: string[];
    latencyMs?: number;
    style?: TemplateStyle;
    previewId?: string;
    docTitle?: string;
  } = {},
): PreviewPage {
  const style = opts.style ?? DEFAULT_TEMPLATE_STYLE;
  const preview_id = opts.previewId ?? genUuid();
  const partial: Pick<PreviewPage, 'sections'> & Partial<PreviewPage> = {
    preview_id,
    sections,
  };
  const html = renderPreviewHtml(partial, style, opts.docTitle);
  return {
    preview_id,
    html,
    template_id: opts.templateId ?? style.template_id ?? null,
    kb_entry_ids: opts.kbEntryIds ?? [],
    sections,
    generated_at: new Date().toISOString(),
    latency_ms: Math.max(0, Math.round(opts.latencyMs ?? 0)),
  };
}
