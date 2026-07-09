/**
 * renderer 单测（T-1.4）
 * - test_renderer_basic_html
 * - test_renderer_with_template_style
 */
import {
  DEFAULT_TEMPLATE_STYLE,
  DARK_TEMPLATE_STYLE,
  buildPreviewPage,
  renderPreviewHtml,
  escapeHtml,
} from '../renderer';
import type { PreviewSection, TemplateStyle } from '../types';

const SECTIONS: PreviewSection[] = [
  { heading: 'Q3 业绩概览', content_html: '<p>营收增长 18%</p>', image_urls: [] },
  {
    heading: '关键进展',
    content_html: '<p>新签 3 家客户</p>',
    image_urls: ['file:///tmp/chart.png'],
  },
];

test('test_renderer_basic_html', () => {
  const html = renderPreviewHtml({ preview_id: 'p1', sections: SECTIONS });
  // 完整文档结构
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(html).toContain('</html>');
  expect(html).toContain('<style>');
  // 章节内容渲染 + contenteditable 锚点
  expect(html).toContain('Q3 业绩概览');
  expect(html).toContain('<p>营收增长 18%</p>');
  expect(html).toContain('data-section-index="0"');
  expect(html).toContain('data-section-index="1"');
  expect(html).toContain('contenteditable="true"');
  // 图片渲染
  expect(html).toContain('file:///tmp/chart.png');
  // XSS 防护：heading 被转义
  const evil = renderPreviewHtml({
    sections: [{ heading: '<script>x</script>', content_html: '<p>ok</p>', image_urls: [] }],
  });
  expect(evil).not.toContain('<script>x</script>');
  expect(evil).toContain('&lt;script&gt;');
  // 空 sections 抛错
  expect(() => renderPreviewHtml({ sections: [] })).toThrow();
});

test('test_renderer_with_template_style', () => {
  // mock T-1.3 风格 JSON
  const mockStyle: TemplateStyle = {
    template_id: 'tpl-corp-2024',
    theme: 'dark',
    palette: {
      primary: '#ff6600',
      secondary: '#0088cc',
      background: '#111111',
      surface: '#222222',
      text: '#eeeeee',
      muted: '#999999',
    },
    fonts: { heading: 'Georgia', body: 'Helvetica' },
    layout: 'corporate',
  };
  const html = renderPreviewHtml({ sections: SECTIONS }, mockStyle);
  // 模板配色注入 CSS 变量
  expect(html).toContain('--lx-primary: #ff6600');
  expect(html).toContain('--lx-bg: #111111');
  // 模板字体注入
  expect(html).toContain('Georgia');
  expect(html).toContain('Helvetica');
  // 模板 id + theme 落到 html 属性
  expect(html).toContain('data-template="tpl-corp-2024"');
  expect(html).toContain('data-theme="dark"');

  // 默认主题 vs 深色主题产出不同
  const light = renderPreviewHtml({ sections: SECTIONS }, DEFAULT_TEMPLATE_STYLE);
  const dark = renderPreviewHtml({ sections: SECTIONS }, DARK_TEMPLATE_STYLE);
  expect(light).not.toEqual(dark);
  expect(light).toContain('data-theme="light"');

  // buildPreviewPage 产出 schema-valid 结构
  const page = buildPreviewPage(SECTIONS, { latencyMs: 1234, templateId: 'tpl-corp-2024' });
  expect(page.preview_id).toBeTruthy();
  expect(page.html).toContain('<!DOCTYPE html>');
  expect(page.template_id).toBe('tpl-corp-2024');
  expect(page.latency_ms).toBe(1234);
  expect(page.sections.length).toBe(2);
  expect(typeof page.generated_at).toBe('string');
});

test('escapeHtml 覆盖 5 类特殊字符', () => {
  expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
});
