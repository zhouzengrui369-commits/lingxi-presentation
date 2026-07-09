/**
 * test_style_analyzer_colors — 验证颜色频次 + palette 提取
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import { countColors, buildPalette } from '../style_analyzer';
import { makeBusinessDarkFixture, makeAcademicLightFixture, makeCreativeGradientFixture } from './fixtures';

describe('style_analyzer colors', () => {
  it('business-dark primary is the dark navy 0B1F3A', () => {
    const f = makeBusinessDarkFixture();
    const palette = buildPalette(countColors(f));
    expect(palette.primary).toBe('#0B1F3A');
  });

  it('academic-light primary is the navy 1F4E79', () => {
    const f = makeAcademicLightFixture();
    const palette = buildPalette(countColors(f));
    expect(palette.primary).toBe('#1F4E79');
  });

  it('creative-gradient palette includes purple/pink/orange', () => {
    const f = makeCreativeGradientFixture();
    const palette = buildPalette(countColors(f));
    const allColors = `${palette.primary}${palette.secondary}${palette.accent}${palette.background}${palette.text}`.toUpperCase();
    // 三个主题色必须出现
    expect(allColors).toContain('6A11CB');
    expect(allColors).toContain('E91E63');
    expect(allColors).toContain('FFC107');
  });

  it('palette has all 5 keys with valid #RRGGBB format', () => {
    const f = makeBusinessDarkFixture();
    const palette = buildPalette(countColors(f));
    for (const key of ['primary', 'secondary', 'accent', 'background', 'text'] as const) {
      expect(palette[key]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('color frequency is sorted by area desc', () => {
    const f = makeBusinessDarkFixture();
    const freq = countColors(f);
    for (let i = 1; i < freq.length; i++) {
      expect(freq[i - 1].area).toBeGreaterThanOrEqual(freq[i].area);
    }
  });

  it('handles fixture with no fill colors → fallback palette', () => {
    const empty: typeof makeBusinessDarkFixture = JSON.parse(JSON.stringify(makeBusinessDarkFixture()));
    for (const slide of empty.slides) {
      slide.shapes = slide.shapes.filter(s => s.type !== 'rect');
    }
    const palette = buildPalette(countColors(empty));
    // 仍有 5 个 key
    expect(Object.keys(palette).sort()).toEqual(['accent', 'background', 'primary', 'secondary', 'text']);
    expect(palette.primary).toMatch(/^#[0-9A-F]{6}$/);
  });
});