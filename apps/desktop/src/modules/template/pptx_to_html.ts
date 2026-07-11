/**
 * pptx_to_html.ts — PPTX 提取 JSON → HTML 转换
 *
 * 输入：extract_pptx.py 输出的 PPTXExtractedJson
 * 输出：完整 HTML 字符串（含 inline CSS，复用 TemplateStyle palette）
 *
 * 关键设计：
 * - 纯函数，无 IO，便于测试
 * - 1 slide → 1 <section>，按 layout_type_guess 套对应模板 class
 * - 颜色 / 字体从 TemplateStyle.palette / .fonts 注入（保证 100% 匹配模板风格）
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import type { TemplateStyle, PPTXExtractedJson, ShapeJson, TextBoxJson } from './types';

export interface PPTXToHtmlOptions {
  /** 风格分析结果（用于注入 CSS variables） */
  style: TemplateStyle;
  /** 可选：自定义标题（默认 = slide.layout_type_guess + index） */
  titleFor?: (slideIndex: number) => string;
}

/** 颜色 hex → CSS rgb() 表示（用于半透明 / box-shadow） */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 把 run 渲染成 <span style>（保字体/字号/粗体/颜色） */
function renderRun(run: { text: string; font_name: string | null; font_size_pt: number | null; bold: boolean | null; color_rgb: string | null }): string {
  const styles: string[] = [];
  if (run.font_name) styles.push(`font-family:${escapeHtml(run.font_name)}`);
  if (run.font_size_pt) styles.push(`font-size:${run.font_size_pt}pt`);
  if (run.bold) styles.push('font-weight:700');
  if (run.color_rgb) styles.push(`color:#${run.color_rgb.replace(/^#/, '').toUpperCase()}`);
  const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
  return `<span${styleAttr}>${escapeHtml(run.text)}</span>`;
}

/** 渲染单个 textbox（保留 paragraph break：用 .runs 拼，但用 | 切） */
function renderTextbox(box: TextBoxJson): string {
  if (!box.runs || box.runs.length === 0) {
    if (!box.text) return '';
    return `<div style="position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;">${escapeHtml(box.text)}</div>`;
  }
  const inner = box.runs.map(renderRun).join('');
  return `<div style="position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;">${inner}</div>`;
}

/** 渲染装饰矩形（背景色块 / 分割线） */
function renderRect(rect: { left: number; top: number; width: number; height: number; fill_rgb: string | null }): string {
  const fill = rect.fill_rgb ? `#${rect.fill_rgb}` : 'transparent';
  return `<div style="position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:${fill};"></div>`;
}

function renderShape(shape: ShapeJson): string {
  switch (shape.type) {
    case 'textbox':
      return renderTextbox(shape);
    case 'rect':
      return renderRect(shape);
    case 'picture':
      return `<div style="position:absolute;left:${shape.left}px;top:${shape.top}px;width:${shape.width}px;height:${shape.height}px;background:rgba(0,0,0,0.05);border:1px dashed #999;">[图片]</div>`;
    case 'other':
    case 'error':
      return '';
    default:
      return '';
  }
}

/** 生成 CSS variables（让模板风格 100% 渗透到 HTML） */
function renderStyleCss(style: TemplateStyle): string {
  const { palette, fonts } = style;
  const bgRgb = hexToRgb(palette.background);
  return `:root {
  --lingxi-primary: ${palette.primary};
  --lingxi-secondary: ${palette.secondary};
  --lingxi-accent: ${palette.accent};
  --lingxi-background: ${palette.background};
  --lingxi-text: ${palette.text};
  --lingxi-heading-font: ${fonts.heading};
  --lingxi-body-font: ${fonts.body};
  --lingxi-bg-rgb: ${bgRgb ? `${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}` : '255,255,255'};
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--lingxi-body-font); background: var(--lingxi-background); color: var(--lingxi-text); }
.lingxi-slide { position: relative; width: 1280px; height: 720px; margin: 16px auto; background: var(--lingxi-background); border: 1px solid #ddd; overflow: hidden; font-family: var(--lingxi-body-font); }
.lingxi-slide h1, .lingxi-slide h2 { font-family: var(--lingxi-heading-font); color: var(--lingxi-text); }
.lingxi-layout-title .lingxi-title { color: var(--lingxi-primary); font-size: 44pt; font-weight: 700; text-align: center; margin-top: 200px; }
.lingxi-layout-section .lingxi-title { color: var(--lingxi-accent); font-size: 36pt; font-weight: 700; }
.lingxi-layout-summary { border-top: 4px solid var(--lingxi-accent); }
.lingxi-decor { position: absolute; pointer-events: none; }
`;
}

/** 把 slide 渲染成 <section> */
function renderSlide(slide: { index: number; layout_type_guess: string; shapes: ShapeJson[] }, _style: TemplateStyle): string {
  const layoutClass = `lingxi-layout-${slide.layout_type_guess}`;
  const shapesHtml = slide.shapes.map(renderShape).join('\n');
  return `<section class="lingxi-slide ${layoutClass}" data-slide-index="${slide.index}">
${shapesHtml}
</section>`;
}

/** 入口：PPTXExtractedJson → 完整 HTML 字符串（含 DOCTYPE + style + body） */
export function pptxToHtml(extracted: PPTXExtractedJson, opts: PPTXToHtmlOptions): string {
  const { style } = opts;
  const css = renderStyleCss(style);
  const slidesHtml = extracted.slides.map(s => renderSlide(s, style)).join('\n');
  const title = escapeHtml(style.name);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
<main class="lingxi-deck">
${slidesHtml}
</main>
</body>
</html>`;
}

/**
 * 验证 HTML 字符串符合"PPT slide 风格"基本契约：
 * - 包含 DOCTYPE
 * - 包含至少 N 个 <section class="lingxi-slide">
 * - 包含 CSS variables 定义（--lingxi-primary 等）
 */
export function validateHtml(html: string, expectedSlideCount: number): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!html.includes('<!DOCTYPE html>')) reasons.push('missing DOCTYPE');
  if (!html.includes('--lingxi-primary')) reasons.push('missing palette CSS var');
  const slideMatches = html.match(/<section class="lingxi-slide/g);
  const found = slideMatches ? slideMatches.length : 0;
  if (found !== expectedSlideCount) {
    reasons.push(`expected ${expectedSlideCount} slides, got ${found}`);
  }
  return { ok: reasons.length === 0, reasons };
}