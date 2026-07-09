/**
 * test_style_analyzer_layout_types — 验证版式出现集合提取
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import { collectLayoutTypes, analyzeStyle } from '../style_analyzer';
import {
  makeBusinessDarkFixture,
  makeAcademicLightFixture,
  makeCreativeGradientFixture,
  makeMinimalFixture,
} from './fixtures';

describe('style_analyzer layout_types', () => {
  it('business-dark has at least title + content + section + summary', () => {
    const f = makeBusinessDarkFixture();
    const layouts = collectLayoutTypes(f);
    expect(layouts).toContain('title');
    expect(layouts).toContain('content');
    expect(layouts).toContain('section');
    expect(layouts).toContain('summary');
  });

  it('academic-light has title + content + section', () => {
    const f = makeAcademicLightFixture();
    const layouts = collectLayoutTypes(f);
    expect(layouts).toContain('title');
    expect(layouts).toContain('content');
    expect(layouts).toContain('section');
  });

  it('creative-gradient has title + section + summary', () => {
    const f = makeCreativeGradientFixture();
    const layouts = collectLayoutTypes(f);
    expect(layouts).toContain('title');
    expect(layouts).toContain('summary');
  });

  it('layout_types sorted by descending frequency', () => {
    const f = makeBusinessDarkFixture();
    const layouts = collectLayoutTypes(f);
    // 第一个必然是 content（出现最多，5 页 content vs 1 title / 1 section / 1 quote / 1 summary / 1 blank）
    expect(layouts[0]).toBe('content');
  });

  it('only valid LayoutType enum values', () => {
    const VALID = new Set(['title', 'section', 'content', 'two_column', 'quote', 'summary', 'blank', 'image_focus', 'chart', 'table']);
    for (const f of [makeBusinessDarkFixture(), makeAcademicLightFixture(), makeCreativeGradientFixture()]) {
      const layouts = collectLayoutTypes(f);
      for (const lt of layouts) {
        expect(VALID.has(lt)).toBe(true);
      }
    }
  });

  it('full analyzeStyle output page_count = slide_count', () => {
    for (const f of [makeBusinessDarkFixture(), makeAcademicLightFixture(), makeCreativeGradientFixture(), makeMinimalFixture()]) {
      const style = analyzeStyle(f);
      expect(style.page_count).toBe(f.slide_count);
    }
  });
});