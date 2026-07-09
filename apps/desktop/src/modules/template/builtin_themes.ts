/**
 * builtin_themes.ts — 内置简约商务（浅 / 深双主题）
 *
 * 无模板时使用。对齐 contracts/template_style.schema.json（positive fixture 校验过）。
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import type { TemplateStyle } from './types';

const ANALYZER_VERSION = '1.0.0';

export const BUILTIN_LIGHT: TemplateStyle = {
  template_id: 'builtin_business_light',
  source: 'builtin',
  name: '简约商务·浅色',
  layout_types: ['title', 'section', 'content', 'two_column', 'summary'],
  palette: {
    primary: '#2D6CDF',
    secondary: '#0EA5E9',
    accent: '#16A34A',
    background: '#FFFFFF',
    text: '#1A1A1A',
  },
  fonts: {
    heading: 'PingFang SC',
    body: 'PingFang SC',
  },
  decorations: ['solid_block', 'line_accent'],
  page_count: 5,
  analyzed_at: '2026-07-09T00:00:00+00:00',
  analyzer_version: ANALYZER_VERSION,
};

export const BUILTIN_DARK: TemplateStyle = {
  template_id: 'builtin_business_dark',
  source: 'builtin',
  name: '简约商务·深色',
  layout_types: ['title', 'section', 'content', 'two_column', 'summary'],
  palette: {
    primary: '#5B8DEF',
    secondary: '#38BDF8',
    accent: '#FACC15',
    background: '#0F172A',
    text: '#F8FAFC',
  },
  fonts: {
    heading: 'PingFang SC',
    body: 'PingFang SC',
  },
  decorations: ['solid_block', 'line_accent', 'border'],
  page_count: 5,
  analyzed_at: '2026-07-09T00:00:00+00:00',
  analyzer_version: ANALYZER_VERSION,
};

export const BUILTIN_THEMES: Record<string, TemplateStyle> = {
  builtin_business_light: BUILTIN_LIGHT,
  builtin_business_dark: BUILTIN_DARK,
};

export function getBuiltinTheme(id: string): TemplateStyle | null {
  return BUILTIN_THEMES[id] ?? null;
}

export function listBuiltinThemes(): TemplateStyle[] {
  return Object.values(BUILTIN_THEMES);
}

/** 装饰元素 helper：把 TemplateStyle.decorations 转成 inline CSS class */
export function decorationsToCssClasses(decorations: TemplateStyle['decorations']): string {
  const map: Record<string, string> = {
    gradient: 'lingxi-decor-gradient',
    solid_block: 'lingxi-decor-block',
    border: 'lingxi-decor-border',
    shadow: 'lingxi-decor-shadow',
    rounded: 'lingxi-decor-rounded',
    line_accent: 'lingxi-decor-line-accent',
    watermark: 'lingxi-decor-watermark',
    icon: 'lingxi-decor-icon',
  };
  return decorations.map(d => map[d] ?? `lingxi-decor-${d}`).join(' ');
}