/**
 * test_builtin_theme_dark — 验证内置深色主题符合 schema 且与 light 区分
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import { BUILTIN_DARK, BUILTIN_LIGHT } from '../builtin_themes';

describe('builtin theme dark', () => {
  it('template_id is builtin_business_dark', () => {
    expect(BUILTIN_DARK.template_id).toBe('builtin_business_dark');
  });

  it('source is builtin', () => {
    expect(BUILTIN_DARK.source).toBe('builtin');
  });

  it('name is 简约商务·深色', () => {
    expect(BUILTIN_DARK.name).toBe('简约商务·深色');
  });

  it('all 5 palette colors are #RRGGBB hex', () => {
    for (const key of ['primary', 'secondary', 'accent', 'background', 'text'] as const) {
      expect(BUILTIN_DARK.palette[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('background is dark (low RGB)', () => {
    const bg = BUILTIN_DARK.palette.background;
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    expect(r + g + b).toBeLessThan(150);
  });

  it('text is light (high RGB) for dark theme readability', () => {
    const text = BUILTIN_DARK.palette.text;
    const r = parseInt(text.slice(1, 3), 16);
    const g = parseInt(text.slice(3, 5), 16);
    const b = parseInt(text.slice(5, 7), 16);
    expect(r + g + b).toBeGreaterThan(600);
  });

  it('dark theme differs from light theme on palette', () => {
    expect(BUILTIN_DARK.palette.background).not.toBe(BUILTIN_LIGHT.palette.background);
    expect(BUILTIN_DARK.palette.text).not.toBe(BUILTIN_LIGHT.palette.text);
  });

  it('analyzer_version matches light (both 1.0.0 builtin)', () => {
    expect(BUILTIN_DARK.analyzer_version).toBe(BUILTIN_LIGHT.analyzer_version);
  });

  it('decorations contains solid_block', () => {
    expect(BUILTIN_DARK.decorations).toContain('solid_block');
  });
});