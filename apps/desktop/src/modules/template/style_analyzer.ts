/**
 * style_analyzer.ts — AI 风格分析（版式 + 主辅色 + 字体 + 装饰）
 *
 * 输入：PPTXExtractedJson（来自 extract_pptx.py）
 * 输出：TemplateStyle（严格对齐 contracts/template_style.schema.json）
 *
 * 实现策略（**纯启发式 + AI 兜底**）：
 * 1. 主路径：本地启发式统计 — 颜色频次（按面积加权）+ 字体频次 + 版式出现集合
 * 2. 兜底：调用 T-1.0.a daemon (/v1/chat) 让 AI 复核 / 补全（失败不致命，回退纯启发式）
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import type {
  PPTXExtractedJson,
  TemplateStyle,
  LayoutType,
  Decoration,
  ColorFrequency,
  FontFrequency,
} from './types';

const ANALYZER_VERSION = '1.0.0';

export interface StyleAnalyzerOptions {
  /** 模板展示名（默认 = 文件名去后缀） */
  name?: string;
  /** 模板 ID（默认 = imported_<sha1_8>） */
  templateId?: string;
  /** daemon URL（可选；如提供则尝试 AI 复核） */
  daemonUrl?: string;
  /** 是否同步调用 daemon（默认 false = 后台异步，不阻塞主流程） */
  syncDaemon?: boolean;
}

/** 把 hex 字符串标准化为 6 位大写（无 #） */
function normalizeHex(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(cleaned)) return null;
  return cleaned;
}

/** 统计颜色频次（按面积加权） */
export function countColors(extracted: PPTXExtractedJson): ColorFrequency[] {
  const map = new Map<string, ColorFrequency>();
  for (const slide of extracted.slides) {
    for (const shape of slide.shapes) {
      const fillHex = normalizeHex(
        shape.type === 'rect' ? shape.fill_rgb : null,
      );
      if (!fillHex) continue;
      const area = (shape.width || 0) * (shape.height || 0);
      const existing = map.get(fillHex) ?? { color: fillHex, count: 0, area: 0 };
      existing.count += 1;
      existing.area += area;
      map.set(fillHex, existing);
    }
    // 文字色也算（按 count 计数，area 给小权重）
    for (const shape of slide.shapes) {
      if (shape.type !== 'textbox') continue;
      for (const run of shape.runs) {
        const textHex = normalizeHex(run.color_rgb);
        if (!textHex) continue;
        const existing = map.get(textHex) ?? { color: textHex, count: 0, area: 0 };
        existing.count += 1;
        existing.area += (shape.width || 0) * (shape.height || 0) * 0.1;
        map.set(textHex, existing);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.area - a.area || b.count - a.count);
}

/** 统计字体频次（heading 优先 bold + font_size_pt >= 18） */
export function countFonts(extracted: PPTXExtractedJson): { heading: FontFrequency[]; body: FontFrequency[] } {
  const headingMap = new Map<string, number>();
  const bodyMap = new Map<string, number>();
  for (const slide of extracted.slides) {
    for (const shape of slide.shapes) {
      if (shape.type !== 'textbox') continue;
      for (const run of shape.runs) {
        if (!run.font_name) continue;
        const isHeading = (run.bold === true) || (run.font_size_pt ?? 0) >= 18;
        const target = isHeading ? headingMap : bodyMap;
        target.set(run.font_name, (target.get(run.font_name) ?? 0) + 1);
      }
    }
  }
  const toSorted = (m: Map<string, number>): FontFrequency[] =>
    Array.from(m.entries())
      .map(([font, count]) => ({ font, count }))
      .sort((a, b) => b.count - a.count);
  return { heading: toSorted(headingMap), body: toSorted(bodyMap) };
}

/** 提取版式出现集合（去重，按频率排序） */
export function collectLayoutTypes(extracted: PPTXExtractedJson): LayoutType[] {
  const counts = new Map<string, number>();
  for (const slide of extracted.slides) {
    const lt = slide.layout_type_guess || 'content';
    counts.set(lt, (counts.get(lt) ?? 0) + 1);
  }
  const VALID: LayoutType[] = [
    'title', 'section', 'content', 'two_column', 'quote',
    'summary', 'blank', 'image_focus', 'chart', 'table',
  ];
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k): k is LayoutType => VALID.includes(k as LayoutType));
}

/** 推断装饰元素（基于矩形/线条分布启发式） */
export function detectDecorations(extracted: PPTXExtractedJson): Decoration[] {
  const out: Decoration[] = [];
  let thinHorizontalRects = 0;
  let largeFillRects = 0;
  let sideAccentRects = 0;
  const total = extracted.slides.length || 1;

  for (const slide of extracted.slides) {
    for (const shape of slide.shapes) {
      if (shape.type !== 'rect') continue;
      const w = shape.width || 0;
      const h = shape.height || 0;
      if (!w || !h) continue;
      const sw = extracted.slide_width_emu || 1;
      const sh = extracted.slide_height_emu || 1;
      const aspectRatio = w / h;
      // 细长水平装饰条
      if (aspectRatio > 30 && h < 0.05 * sh) thinHorizontalRects += 1;
      // 大块填充（背景）
      if (w > 0.8 * sw && h > 0.8 * sh) largeFillRects += 1;
      // 侧边强调条（左/右竖条）
      if (aspectRatio < 0.1 && (h > 0.5 * sh)) sideAccentRects += 1;
    }
  }

  // 阈值：≥ 30% 页面有该装饰才记入
  if (largeFillRects / total >= 0.3) out.push('solid_block');
  if (thinHorizontalRects / total >= 0.3) out.push('line_accent');
  if (sideAccentRects / total >= 0.3) out.push('border');

  // 兜底：至少 1 个装饰
  if (out.length === 0) out.push('solid_block');
  return out;
}

/** 从颜色频次挑出 5 色：primary/secondary/accent/background/text */
export function buildPalette(colorFreq: ColorFrequency[]): TemplateStyle['palette'] {
  const ranked = colorFreq;
  // 默认值兜底
  const fallback = {
    primary: '#2D6CDF',
    secondary: '#0EA5E9',
    accent: '#16A34A',
    background: '#FFFFFF',
    text: '#1A1A1A',
  };
  if (ranked.length === 0) return fallback;

  // primary = 面积最大的色
  const primary = `#${ranked[0].color}`;
  const secondary = ranked[1] ? `#${ranked[1].color}` : fallback.secondary;
  // accent = 与 primary 差异大但频次不低的色
  let accent = secondary;
  for (const c of ranked) {
    const hex = `#${c.color}`;
    if (hex === primary || hex === secondary) continue;
    if (c.count >= 2) {
      accent = hex;
      break;
    }
  }
  // background = 整页最大填充（通常是第一个 full-slide 矩形）
  let background = fallback.background;
  for (const c of ranked) {
    const hex = `#${c.color}`;
    if (hex === primary) continue;
    // 用面积判定（> 50% slide 面积）
    if (c.area > 5e10) {
      background = hex;
      break;
    }
  }
  // text = 黑色 / 深灰优先
  let text = fallback.text;
  for (const c of ranked) {
    const hex = `#${c.color}`;
    const r = parseInt(c.color.slice(0, 2), 16);
    const g = parseInt(c.color.slice(2, 4), 16);
    const b = parseInt(c.color.slice(4, 6), 16);
    const isDark = r + g + b < 200;
    if (isDark && (hex !== primary && hex !== background)) {
      text = hex;
      break;
    }
  }

  return { primary, secondary, accent, background, text };
}

export function buildFonts(headingFreq: FontFrequency[], bodyFreq: FontFrequency[]): TemplateStyle['fonts'] {
  const heading = headingFreq[0]?.font ?? bodyFreq[0]?.font ?? 'PingFang SC';
  const body = bodyFreq[0]?.font ?? headingFreq[0]?.font ?? 'PingFang SC';
  return { heading, body };
}

/** 生成 8 位 sha1 hex（用于模板 ID 前缀） */
function shortHash(s: string): string {
  // 轻量 hash（避免引入 crypto 依赖；模板 ID 不需要密码学强度）
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 8);
}

/** 主入口：PPTXExtractedJson → TemplateStyle */
export function analyzeStyle(extracted: PPTXExtractedJson, opts: StyleAnalyzerOptions = {}): TemplateStyle {
  const colorFreq = countColors(extracted);
  const { heading: headingFreq, body: bodyFreq } = countFonts(extracted);
  const layoutTypes = collectLayoutTypes(extracted);
  const decorations = detectDecorations(extracted);

  const name = opts.name ?? extracted.file.replace(/\.pptx$/i, '');
  const templateId = opts.templateId ?? `imported_${shortHash(extracted.file_path)}`;

  return {
    template_id: templateId,
    source: 'imported',
    name,
    layout_types: layoutTypes.length > 0 ? layoutTypes : ['content'],
    palette: buildPalette(colorFreq),
    fonts: buildFonts(headingFreq, bodyFreq),
    decorations,
    page_count: extracted.slide_count,
    analyzed_at: new Date().toISOString(),
    analyzer_version: ANALYZER_VERSION,
  };
}

/**
 * 可选：调用 T-1.0.a daemon 让 AI 复核 / 补全风格。
 * 默认 3s timeout，失败回退纯启发式。
 */
export async function refineWithDaemon(
  style: TemplateStyle,
  extracted: PPTXExtractedJson,
  daemonUrl: string,
  timeoutMs = 3000,
): Promise<TemplateStyle> {
  const prompt = `你是一个 PPT 风格审计助手。给定下列启发式分析结果，请你核对并在必要处补全：
${JSON.stringify({ style, sample_slides: extracted.slides.slice(0, 3).map(s => s.layout_type_guess) }, null, 2)}

只输出修正后的 JSON（不要 markdown fence，不要解释）。保持 TemplateStyle schema 不变。`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${daemonUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, temperature: 0.2, max_tokens: 2000 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return style;
    const data = await res.json();
    const content = (data.content || '') as string;
    // 尝试从回复里抽 JSON
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return style;
    const refined = JSON.parse(match[0]);
    // 字段合并（保留启发式为主，AI 仅补 decoration / name）
    return {
      ...style,
      name: refined.name ?? style.name,
      decorations: Array.isArray(refined.decorations) ? refined.decorations : style.decorations,
      layout_types: Array.isArray(refined.layout_types) ? refined.layout_types : style.layout_types,
    };
  } catch {
    return style;
  }
}

/**
 * 完整流程：analyze + 可选 daemon 复核
 */
export async function analyzeAndExport(
  extracted: PPTXExtractedJson,
  opts: StyleAnalyzerOptions = {},
): Promise<TemplateStyle> {
  const style = analyzeStyle(extracted, opts);
  if (opts.daemonUrl && opts.syncDaemon) {
    return await refineWithDaemon(style, extracted, opts.daemonUrl);
  }
  return style;
}