/**
 * test_builtin_theme_light — 验证内置浅色主题符合 schema
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import { BUILTIN_LIGHT, getBuiltinTheme, listBuiltinThemes } from '../builtin_themes';

describe('builtin theme light', () => {
  it('template_id is builtin_business_light', () => {
    expect(BUILTIN_LIGHT.template_id).toBe('builtin_business_light');
  });

  it('source is builtin', () => {
    expect(BUILTIN_LIGHT.source).toBe('builtin');
  });

  it('name is 简约商务·浅色', () => {
    expect(BUILTIN_LIGHT.name).toBe('简约商务·浅色');
  });

  it('all 5 palette colors are #RRGGBB hex', () => {
    for (const key of ['primary', 'secondary', 'accent', 'background', 'text'] as const) {
      expect(BUILTIN_LIGHT.palette[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('background is white-ish (high RGB)', () => {
    const bg = BUILTIN_LIGHT.palette.background;
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    expect(r + g + b).toBeGreaterThan(700);  // near white
  });

  it('fonts.heading and fonts.body are non-empty', () => {
    expect(BUILTIN_LIGHT.fonts.heading.length).toBeGreaterThan(0);
    expect(BUILTIN_LIGHT.fonts.body.length).toBeGreaterThan(0);
  });

  it('analyzer_version is semver', () => {
    expect(BUILTIN_LIGHT.analyzer_version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  });

  it('analyzed_at is valid ISO date', () => {
    expect(() => new Date(BUILTIN_LIGHT.analyzed_at)).not.toThrow();
    expect(new Date(BUILTIN_LIGHT.analyzed_at).toString()).not.toBe('Invalid Date');
  });

  it('layout_types is non-empty array of valid enums', () => {
    expect(Array.isArray(BUILTIN_LIGHT.layout_types)).toBe(true);
    expect(BUILTIN_LIGHT.layout_types.length).toBeGreaterThan(0);
    const VALID = new Set(['title', 'section', 'content', 'two_column', 'quote', 'summary', 'blank', 'image_focus', 'chart', 'table']);
    for (const lt of BUILTIN_LIGHT.layout_types) {
      expect(VALID.has(lt)).toBe(true);
    }
  });

  it('decorations contains solid_block + line_accent', () => {
    expect(BUILTIN_LIGHT.decorations).toContain('solid_block');
    expect(BUILTIN_LIGHT.decorations).toContain('line_accent');
  });

  it('getBuiltinTheme(builtin_business_light) returns same object', () => {
    expect(getBuiltinTheme('builtin_business_light')).toBe(BUILTIN_LIGHT);
  });

  it('getBuiltinTheme(unknown) returns null', () => {
    expect(getBuiltinTheme('unknown')).toBeNull();
  });

  it('listBuiltinThemes returns both light + dark', () => {
    const themes = listBuiltinThemes();
    expect(themes.length).toBeGreaterThanOrEqual(2);
    expect(themes.map(t => t.template_id)).toContain('builtin_business_light');
    expect(themes.map(t => t.template_id)).toContain('builtin_business_dark');
  });
});