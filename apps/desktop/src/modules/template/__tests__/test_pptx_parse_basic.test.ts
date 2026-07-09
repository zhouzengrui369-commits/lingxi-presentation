/**
 * test_pptx_parse_basic — 验证 PPTXExtractedJson 结构合法
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import { makeBusinessDarkFixture, makeMinimalFixture, makeEmptyFixture } from './fixtures';

describe('PPTXExtractedJson parse basic', () => {
  it('business-dark fixture has 12 slides', () => {
    const f = makeBusinessDarkFixture();
    expect(f.slide_count).toBe(12);
    expect(f.slides.length).toBe(12);
  });

  it('every slide has index + layout_type_guess + shapes array', () => {
    const f = makeBusinessDarkFixture();
    for (const slide of f.slides) {
      expect(typeof slide.index).toBe('number');
      expect(typeof slide.layout_type_guess).toBe('string');
      expect(Array.isArray(slide.shapes)).toBe(true);
    }
  });

  it('rect/textbox shapes have valid bounding box (EMU > 0)', () => {
    const f = makeBusinessDarkFixture();
    let totalRects = 0;
    let totalTextboxes = 0;
    for (const slide of f.slides) {
      for (const s of slide.shapes) {
        if (s.type === 'rect') {
          totalRects += 1;
          expect(s.width).toBeGreaterThan(0);
          expect(s.height).toBeGreaterThan(0);
        }
        if (s.type === 'textbox') {
          totalTextboxes += 1;
          expect(s.width).toBeGreaterThan(0);
        }
      }
    }
    expect(totalRects).toBeGreaterThan(0);
    expect(totalTextboxes).toBeGreaterThan(0);
  });

  it('minimal fixture has 1 slide with 1 textbox', () => {
    const f = makeMinimalFixture();
    expect(f.slide_count).toBe(1);
    expect(f.slides[0].shapes.length).toBe(1);
    expect(f.slides[0].shapes[0].type).toBe('textbox');
  });

  it('empty fixture is well-formed but empty', () => {
    const f = makeEmptyFixture();
    expect(f.slide_count).toBe(1);
    expect(f.slides[0].shapes.length).toBe(0);
  });
});