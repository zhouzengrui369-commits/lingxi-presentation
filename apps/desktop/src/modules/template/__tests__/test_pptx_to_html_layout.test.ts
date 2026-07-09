/**
 * test_pptx_to_html_layout — 验证 PPTX → HTML 转换保留版式
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import { pptxToHtml, validateHtml } from '../pptx_to_html';
import { analyzeStyle } from '../style_analyzer';
import {
  makeBusinessDarkFixture,
  makeAcademicLightFixture,
  makeCreativeGradientFixture,
} from './fixtures';

describe('pptx_to_html layout preservation', () => {
  it('renders all slides as <section class="lingxi-slide">', () => {
    const extracted = makeBusinessDarkFixture();
    const style = analyzeStyle(extracted);
    const html = pptxToHtml(extracted, { style });
    expect(html).toMatch(/<section class="lingxi-slide lingxi-layout-title"/);
    expect(html).toMatch(/<section class="lingxi-slide lingxi-layout-content"/);
    expect(html).toMatch(/<section class="lingxi-slide lingxi-layout-summary"/);
  });

  it('html contains DOCTYPE and CSS variables', () => {
    const extracted = makeAcademicLightFixture();
    const style = analyzeStyle(extracted);
    const html = pptxToHtml(extracted, { style });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('--lingxi-primary:');
    expect(html).toContain('--lingxi-heading-font:');
  });

  it('validates correct slide count', () => {
    const extracted = makeCreativeGradientFixture();
    const style = analyzeStyle(extracted);
    const html = pptxToHtml(extracted, { style });
    const result = validateHtml(html, extracted.slide_count);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('emits per-shape position + color inline', () => {
    const extracted = makeBusinessDarkFixture();
    const style = analyzeStyle(extracted);
    const html = pptxToHtml(extracted, { style });
    // 第一个 slide 的背景矩形（深海军蓝）应该被渲染
    expect(html).toMatch(/background:#0B1F3A/i);
    // 文本颜色（白色）
    expect(html).toMatch(/color:#FFFFFF/i);
  });

  it('text runs preserve font name + size', () => {
    const extracted = makeBusinessDarkFixture();
    const style = analyzeStyle(extracted);
    const html = pptxToHtml(extracted, { style });
    expect(html).toContain('Microsoft YaHei');
    expect(html).toContain('28pt');
  });
});