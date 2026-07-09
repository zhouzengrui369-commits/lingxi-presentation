/**
 * test_style_analyzer_fonts — 验证字体频次 + heading/body 提取
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import { countFonts, buildFonts } from '../style_analyzer';
import {
  makeBusinessDarkFixture,
  makeAcademicLightFixture,
  makeCreativeGradientFixture,
} from './fixtures';

describe('style_analyzer fonts', () => {
  it('business-dark uses Microsoft YaHei (heading + body)', () => {
    const f = makeBusinessDarkFixture();
    const { heading, body } = countFonts(f);
    const fonts = buildFonts(heading, body);
    expect(fonts.heading).toBe('Microsoft YaHei');
    expect(fonts.body).toBe('Microsoft YaHei');
  });

  it('academic-light uses SimHei for heading + SimSun for body', () => {
    const f = makeAcademicLightFixture();
    const { heading, body } = countFonts(f);
    const fonts = buildFonts(heading, body);
    expect(fonts.heading).toBe('SimHei');
    expect(fonts.body).toBe('SimSun');
  });

  it('creative-gradient uses STHeiti', () => {
    const f = makeCreativeGradientFixture();
    const { heading, body } = countFonts(f);
    const fonts = buildFonts(heading, body);
    expect(['STHeiti']).toContain(fonts.heading);
    expect(['STHeiti']).toContain(fonts.body);
  });

  it('countFonts returns sorted descending by count', () => {
    const f = makeBusinessDarkFixture();
    const { heading, body } = countFonts(f);
    for (let i = 1; i < heading.length; i++) {
      expect(heading[i - 1].count).toBeGreaterThanOrEqual(heading[i].count);
    }
    for (let i = 1; i < body.length; i++) {
      expect(body[i - 1].count).toBeGreaterThanOrEqual(body[i].count);
    }
  });

  it('fallback to PingFang SC when no fonts found', () => {
    const fonts = buildFonts([], []);
    expect(fonts.heading).toBe('PingFang SC');
    expect(fonts.body).toBe('PingFang SC');
  });
});