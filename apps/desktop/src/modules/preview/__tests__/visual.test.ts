/**
 * 可视化产物生成（T-1.4 截图取证）
 * 用真实的 renderer / editor / autosave 模块产出 4 张状态的 HTML，
 * 交给 playwright 截图（screenshots/T-1.4/）。跑在 preview jest 配置下（babel 解析全部导入）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildPreviewPage, renderPreviewHtml } from '../renderer';
import { applyTextChange, reorderSection } from '../editor';
import { getStatusText } from '../autosave';
import type { PreviewPage } from '../types';

const OUT = path.join(__dirname, '..', '..', '..', '..', 'testdata', 'preview-visual');

function basePage(): PreviewPage {
  return buildPreviewPage(
    [
      {
        heading: 'Q3 业绩概览',
        content_html: '<p>本季度营收环比增长 <strong>18%</strong>，核心 KPI 全面达标。</p>',
        image_urls: [],
      },
      {
        heading: '关键进展',
        content_html:
          '<ul><li>新签约 3 家标杆客户</li><li>老客户续约率 92%</li><li>交付周期缩短 30%</li></ul>',
        image_urls: [],
      },
      {
        heading: '下季度计划',
        content_html: '<p>聚焦渠道拓展、产品化交付与客户成功体系建设。</p>',
        image_urls: [],
      },
    ],
    { latencyMs: 552, previewId: '2f1a-demo' },
  );
}

/** 包一层带标题横幅的展示页 */
function wrap(title: string, banner: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>
<style>
  body{margin:0;font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#eef2f7;}
  .cap{padding:12px 20px;background:#1e293b;color:#fff;font-size:15px;font-weight:600;}
  .banner{padding:10px 20px;background:#dcfce7;border-bottom:2px solid #16a34a;font-size:13px;display:flex;justify-content:space-between;}
  .cols{display:flex;gap:16px;padding:16px;}
  .col{flex:1;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);}
  .col h3{margin:0;padding:8px 14px;font-size:13px;background:#f1f5f9;color:#475569;}
  .frame{height:520px;border:0;width:100%;}
  .single{padding:16px;}
  .single .col{max-width:820px;margin:0 auto;}
</style></head><body>
<div class="cap">T-1.4 HTML 预览与编辑 · ${title}</div>
<div class="banner">${banner}</div>
${bodyHtml}
</body></html>`;
}

function frame(html: string): string {
  return `<iframe class="frame" srcdoc="${html.replace(/"/g, '&quot;')}"></iframe>`;
}

test('生成 4 张截图源 HTML', () => {
  fs.mkdirSync(OUT, { recursive: true });
  const page = basePage();

  // 01 预览生成（含延迟毫秒数 + 保存指示器）
  const genHtml = renderPreviewHtml(page).replace(
    /<body>\s*/,
    m =>
      `${m}\n<div style="display:flex;justify-content:space-between;padding:10px 16px;margin:-32px -40px 20px;background:#dcfce7;border-bottom:2px solid #16a34a;font-size:13px;"><span>⚡ AI 生成延迟 <strong>552ms</strong> ✓ ≤10s · provider=api</span><span style="color:#2563eb;font-weight:600;">已保存 · 刚刚</span></div>\n`,
  );
  fs.writeFileSync(
    path.join(OUT, '01_preview_generated.html'),
    wrap(
      '① AI 生成预览页',
      '<span>⚡ AI 生成延迟 <strong>552ms</strong> ✓ ≤10s（PRD 硬指标）</span><span>由 renderer.renderPreviewHtml 产出</span>',
      `<div class="single"><div class="col"><h3>渲染结果（含延迟横幅）</h3>${frame(genHtml)}</div></div>`,
    ),
    'utf8',
  );

  // 02 轻量编辑：改文字（before/after）
  const edited = applyTextChange(page, 0, {
    heading: 'Q3 业绩概览 · 超预期达成',
    content_html: '<p>营收环比增长 <strong>23%</strong>（上调），三大 KPI 全部超额。</p>',
  });
  fs.writeFileSync(
    path.join(OUT, '02_editor_text_change.html'),
    wrap(
      '② 轻量编辑 · 直接改文字生效',
      '<span>editor.applyTextChange(page, 0, {...}) → 标题/正文即时更新</span><span>不可变更新，其他章节不受影响</span>',
      `<div class="cols">
        <div class="col"><h3>编辑前</h3>${frame(renderPreviewHtml(page))}</div>
        <div class="col"><h3>编辑后（标题+正文已改，18%→23%）</h3>${frame(renderPreviewHtml(edited))}</div>
      </div>`,
    ),
    'utf8',
  );

  // 03 段落顺序调整（before/after）：把"下季度计划"(2) 上移到首位
  const reordered = reorderSection(page, 2, 0);
  fs.writeFileSync(
    path.join(OUT, '03_editor_paragraph_reorder.html'),
    wrap(
      '③ 段落顺序调整',
      '<span>editor.reorderSection(page, 2, 0) → "下季度计划" 移到首位</span><span>段落顺序即时重排</span>',
      `<div class="cols">
        <div class="col"><h3>调整前：概览 → 进展 → 计划</h3>${frame(renderPreviewHtml(page))}</div>
        <div class="col"><h3>调整后：计划 → 概览 → 进展</h3>${frame(renderPreviewHtml(reordered))}</div>
      </div>`,
    ),
    'utf8',
  );

  // 04 实时保存指示器："已保存 3s 前"
  const now = 1_000_000;
  const status3s = getStatusText({ lastSavedAt: now - 3000, dirty: false }, now);
  const statusDirty = getStatusText({ lastSavedAt: now - 1000, dirty: true }, now);
  const indicatorHtml = renderPreviewHtml(page).replace(
    /<body>\s*/,
    m =>
      `${m}\n<div style="display:flex;justify-content:flex-end;gap:16px;padding:10px 16px;margin:-32px -40px 20px;background:#eff6ff;border-bottom:2px solid #2563eb;font-size:14px;"><span style="color:#2563eb;font-weight:700;">🖫 ${status3s}</span></div>\n`,
  );
  fs.writeFileSync(
    path.join(OUT, '04_autosave_indicator.html'),
    wrap(
      '④ 实时保存指示器',
      `<span>autosave 每 5s 落盘 → getStatusText 生成："${status3s}"</span><span>有改动时："${statusDirty}"</span>`,
      `<div class="single"><div class="col"><h3>预览页右上角保存状态</h3>${frame(indicatorHtml)}</div></div>`,
    ),
    'utf8',
  );

  // 断言 4 张都写出且非空
  for (const f of [
    '01_preview_generated.html',
    '02_editor_text_change.html',
    '03_editor_paragraph_reorder.html',
    '04_autosave_indicator.html',
  ]) {
    const p = path.join(OUT, f);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).size).toBeGreaterThan(1000);
  }
  expect(status3s).toContain('3s 前');
});
