/**
 * T-failClosed: 4 路由 fail-closed 验证器单元测试
 * 灵犀演示 · Phase 6 · T-6.1 (W3 fail-closed 治本)
 *
 * 父级 PM 真机复现:
 *   1. file-kb import — daemon unavailable → { ok: true, data: { files: 0, entries: 0 } } 仍显示"导入完成"
 *   2. advisor chat   — { ok: true, data: { content: "hello (mock)" }, provider: "undefined" } 仍显示"建议已生成"
 *   3. preview        — { ok: true, data: { sections: [...5], provider: "mock", fell_back: true, latency_ms: 0 } } 仍显示"预览生成完成"
 *   4. output         — { ok: true, data: { output_path: "?", size_bytes: 0, status: "failed" } } 仍显示".pptx 已生成 ✓"
 *
 * 这 4 个场景必须 fail-closed, 不能进 success 路径。
 * 同时, 正常成功路径不能回归 (1 happy path per module)。
 */
const fc = require('../src/failClosed.js');

// ---- 1. file_kb_import ----
describe('validateFileKbImport', () => {
  test('父级 PM 场景 1: data.files=0 (numeric 形态) → 不进 success', () => {
    // 兼容 numeric 形态 (上游可能返 count)
    const r = { ok: true, data: { files: 0, entries: 0 }, latency_ms: 12 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
    expect(v.kind).not.toBe(fc.VERDICT.SUCCESS);
  });

  test('父级 PM 场景 1b: data.files 缺失 → 不进 success', () => {
    const r = { ok: true, data: { entries: 0 }, latency_ms: 12 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('父级 PM 场景 1c: latency_ms=0 → 不进 success', () => {
    const r = { ok: true, data: { files: 3, entries: 5 }, latency_ms: 0 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('父级 PM 场景 1d: ok=false → failed', () => {
    const r = { ok: false, error: 'daemon_unreachable', error_code: 'E_DAEMON' };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.FAILED);
  });

  test('happy path (numeric 兼容): ok=true + files=5 (number) + latency>0 → success', () => {
    const r = { ok: true, data: { files: 5, entries: 10 }, latency_ms: 1234 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
    expect(v.data.files).toBe(5);
    expect(v.latency_ms).toBe(1234);
  });
});

// ---- 1b. validateFileKbImport 【W3 PM REPAIR】真实合同 tests (files/entries 是 array) ----
// 真实合同: /v1/import 返 files=[] , entries=[]  (backend/daemon/server.py:326-339)
describe('validateFileKbImport [real contract]', () => {
  test('真实合同: data.files=[] (空数组, daemon unavailable) → invalid (PM 场景 1 真实复现)', () => {
    // 父级 PM 真机复现: 装版 daemon unavailable → /v1/import 返 files=[], entries=[]
    const r = { ok: true, data: { ok: true, files: [], entries: [], failed: [], kb_root: '/tmp/lingxi_kb', elapsed_ms: 0, manifest: { version: '1.0.0', file_count: 0, entry_count: 0, total_size_bytes: 0 } }, latency_ms: 12 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
    expect(v.kind).not.toBe(fc.VERDICT.SUCCESS);
    expect(v.reason).toMatch(/空/);
  });

  test('真实合同: data.files=["a.md","b.md"] (非空数组) → success', () => {
    // 真活 daemon 返的 happy path: 5 个文件
    const r = { ok: true, data: { ok: true, files: ['2026q1_overview.md', '2026q1_metrics.md', '2026q1_roadmap.md', '2026q1_risks.md', '2026q1_summary.md'], entries: ['overview', 'metrics', 'roadmap', 'risks', 'summary'], failed: [], kb_root: '/tmp/lingxi_kb', elapsed_ms: 1234 }, latency_ms: 1500 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
    expect(v.data.files).toHaveLength(5);
    expect(v.data.entries).toHaveLength(5);
  });

  test('真实合同: data.files=[1 个文件] → success (1 个非空)', () => {
    const r = { ok: true, data: { files: ['only_one.md'], entries: ['one'], kb_root: '/tmp/lingxi_kb' }, latency_ms: 100 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
  });

  test('真实合同: data.files 非 array 非 number → invalid', () => {
    const r = { ok: true, data: { files: 'broken', entries: [] }, latency_ms: 100 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('真实合同: data.files=undefined → invalid (保留旧 fixture 行为)', () => {
    const r = { ok: true, data: { entries: [] }, latency_ms: 100 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('PM REPAIR: numeric 形态 files=3 → 仍 success (兼容 upstream 改回 number)', () => {
    const r = { ok: true, data: { files: 3, entries: 5 }, latency_ms: 500 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
  });

  test('PM REPAIR: numeric 形态 files=-1 → invalid (防御)', () => {
    const r = { ok: true, data: { files: -1, entries: 0 }, latency_ms: 100 };
    const v = fc.validateFileKbImport(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });
});

// ---- 2. advisor_chat ----
describe('validateAdvisorChat', () => {
  test('父级 PM 场景 2: provider=undefined, elapsed_ms=0 → 不进 success', () => {
    const r = { ok: true, data: { content: 'hello (mock)' }, provider: 'undefined', elapsed_ms: 0 };
    const v = fc.validateAdvisorChat(r);
    // provider=undefined 走 degraded (mock/unavailable 降级), elapsed_ms=0 走 invalid
    // 优先返回 degraded (provider 缺失), 但绝对不能是 success
    expect(v.kind).not.toBe(fc.VERDICT.SUCCESS);
    expect([fc.VERDICT.DEGRADED, fc.VERDICT.INVALID]).toContain(v.kind);
  });

  test('父级 PM 场景 2b: provider=mock, content=hello (mock) → degraded', () => {
    const r = { ok: true, data: { content: 'hello (mock)', provider: 'mock', fell_back: true }, provider: 'mock', elapsed_ms: 5 };
    const v = fc.validateAdvisorChat(r);
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
  });

  test('父级 PM 场景 2c: provider=unavailable → degraded', () => {
    const r = { ok: true, data: { content: 'fallback text', provider: 'unavailable' }, provider: 'unavailable', elapsed_ms: 10 };
    const v = fc.validateAdvisorChat(r);
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
  });

  test('父级 PM 场景 2d: content 缺失 → invalid', () => {
    const r = { ok: true, data: {}, provider: 'openai', elapsed_ms: 100 };
    const v = fc.validateAdvisorChat(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('父级 PM 场景 2e: fell_back=true → degraded', () => {
    const r = { ok: true, data: { content: 'real content', provider: 'openai', fell_back: true }, provider: 'openai', elapsed_ms: 500 };
    const v = fc.validateAdvisorChat(r);
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
  });

  test('happy path: ok=true + provider=openai + content 非空 + elapsed>0 → success', () => {
    const r = { ok: true, data: { content: '建议大纲:\n1. ...', provider: 'openai', fell_back: false }, provider: 'openai', elapsed_ms: 1500 };
    const v = fc.validateAdvisorChat(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
    expect(v.provider).toBe('openai');
    expect(v.elapsed_ms).toBe(1500);
  });
});

// ---- 3. preview_generate ----
describe('validatePreviewGenerate', () => {
  test('父级 PM 场景 3: fell_back=true, provider=mock, latency_ms=0 → 不进 success', () => {
    // 注: 章节正文是真实内容 (REWORK 02 验证), 但 fell_back=true 优先判 degraded
    const r = { ok: true, data: { sections: [
      { heading: '业绩概览', content_html: '<p>内容 a</p>', image_urls: [] },
      { heading: '关键进展', content_html: '<p>内容 b</p>', image_urls: [] },
      { heading: '下季度计划', content_html: '<p>内容 c</p>', image_urls: [] },
      { heading: '风险与挑战', content_html: '<p>内容 d</p>', image_urls: [] },
      { heading: '数据亮点', content_html: '<p>内容 e</p>', image_urls: [] },
    ], section_count: 5, provider: 'mock', fell_back: true, latency_ms: 0 } };
    const v = fc.validatePreviewGenerate(r);
    // fell_back=true 优先, 进 degraded
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
    expect(v.kind).not.toBe(fc.VERDICT.SUCCESS);
  });

  test('父级 PM 场景 3b: provider=mock, fell_back=false → degraded', () => {
    const r = { ok: true, data: { sections: [
      { heading: '业绩概览', content_html: '<p>内容 a</p>', image_urls: [] },
      { heading: '关键进展', content_html: '<p>内容 b</p>', image_urls: [] },
    ], section_count: 2, provider: 'mock', fell_back: false, latency_ms: 10 } };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
  });

  test('父级 PM 场景 3c: latency_ms=0 (但 provider=live) → invalid', () => {
    const r = { ok: true, data: { sections: [
      { heading: '业绩概览', content_html: '<p>内容 a</p>', image_urls: [] },
      { heading: '关键进展', content_html: '<p>内容 b</p>', image_urls: [] },
    ], section_count: 2, provider: 'openai', fell_back: false, latency_ms: 0 } };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('父级 PM 场景 3d: sections 是空数组 → invalid', () => {
    const r = { ok: true, data: { sections: [], section_count: 0, provider: 'openai', fell_back: false, latency_ms: 1000 } };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('父级 PM 场景 3e: sections 不是数组 → invalid', () => {
    const r = { ok: true, data: { sections: 'broken', section_count: 1, provider: 'openai', fell_back: false, latency_ms: 1000 } };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('happy path: ok=true + 5 真实章节 + provider=openai + fell_back=false + latency>0 → success', () => {
    const r = { ok: true, data: { sections: [
      { heading: '业绩概览', content_html: '<p>本季度营收环比增长 <strong>18%</strong>，核心 KPI 全面达标。</p>', image_urls: [] },
      { heading: '关键进展', content_html: '<ul><li>新签约 3 家标杆客户</li><li>老客户续约率 92%</li></ul>', image_urls: [] },
      { heading: '下季度计划', content_html: '<p>聚焦渠道拓展、产品化交付与客户成功体系建设。</p>', image_urls: [] },
      { heading: '风险与挑战', content_html: '<p>宏观需求恢复速度低于预期, 需提前预判行业拐点。</p>', image_urls: [] },
      { heading: '数据亮点', content_html: '<p><strong>18%</strong> 营收增长, <strong>92%</strong> 续约率。</p>', image_urls: [] },
    ], section_count: 5, provider: 'openai', fell_back: false, latency_ms: 2500 } };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
    expect(v.data.sections).toHaveLength(5);
  });
});

// ---- 3b. validatePreviewGenerate 【REWORK 02 治本】真实 placeholder fixture ----
// 父级 PM 第二次验收证据: 5/5 sections 内容均为 `（章节超时: fetch failed）` 仍判 success → false-green
// 占位符来源 (apps/desktop/cli/preview.ts:113, 122):
//   - HTTP 非 200: `<p class="lx-muted">（章节生成失败: HTTP ${status}）</p>`
//   - 超时/抓取失败: `<p class="lx-muted">（章节超时: ${e.message}）</p>`, e.message 常为 "fetch failed"
describe('validatePreviewGenerate [REWORK 02 placeholder fixtures]', () => {
  // ---- 真实 Wave 6 复现: 5/5 sections 均为 (章节超时: fetch failed) ----
  test('REWORK 02 主 fixture: 5/5 sections 均为 (章节超时: fetch failed) → 非 success', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '业绩概览', content_html: '<p class="lx-muted">（章节超时: fetch failed）</p>', image_urls: [] },
          { heading: '关键进展', content_html: '<p class="lx-muted">（章节超时: fetch failed）</p>', image_urls: [] },
          { heading: '下季度计划', content_html: '<p class="lx-muted">（章节超时: fetch failed）</p>', image_urls: [] },
          { heading: '风险与挑战', content_html: '<p class="lx-muted">（章节超时: fetch failed）</p>', image_urls: [] },
          { heading: '数据亮点', content_html: '<p class="lx-muted">（章节超时: fetch failed）</p>', image_urls: [] },
        ],
        section_count: 5,
        provider: 'api',
        fell_back: false,
        latency_ms: 8000,
      },
      latency_ms: 8000,
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).not.toBe(fc.VERDICT.SUCCESS);
    expect([fc.VERDICT.INVALID, fc.VERDICT.FAILED]).toContain(v.kind);
    // 命中第 1 个无效章节
    expect(v.invalidSectionIndex).toBe(0);
    expect(v.reason).toMatch(/第 1\/5 章节无效/);
  });

  test('REWORK 02 变体: 1 个章节占位符 + 4 个有效 → 非 success (单点失败全段无效)', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '业绩概览', content_html: '<p>本季度营收环比增长 <strong>18%</strong>，核心 KPI 全面达标。</p>', image_urls: [] },
          { heading: '关键进展', content_html: '<ul><li>新签约 3 家标杆客户</li><li>老客户续约率 92%</li></ul>', image_urls: [] },
          { heading: '下季度计划', content_html: '<p>聚焦渠道拓展、产品化交付与客户成功体系建设。</p>', image_urls: [] },
          { heading: '风险与挑战', content_html: '<p class="lx-muted">（章节超时: fetch failed）</p>', image_urls: [] },
          { heading: '数据亮点', content_html: '<p><strong>18%</strong> 营收增长, <strong>92%</strong> 续约率。</p>', image_urls: [] },
        ],
        section_count: 5,
        provider: 'api',
        fell_back: false,
        latency_ms: 5000,
      },
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).not.toBe(fc.VERDICT.SUCCESS);
    expect(v.invalidSectionIndex).toBe(3);
  });

  test('REWORK 02 变体: 章节正文为空字符串 → invalid', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '业绩概览', content_html: '', image_urls: [] },
          { heading: '关键进展', content_html: '<p>内容</p>', image_urls: [] },
        ],
        section_count: 2,
        provider: 'api',
        fell_back: false,
        latency_ms: 100,
      },
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('REWORK 02 变体: 章节正文只有空白 → invalid', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '业绩概览', content_html: '<p>   </p>', image_urls: [] },
          { heading: '关键进展', content_html: '<p>内容</p>', image_urls: [] },
        ],
        section_count: 2,
        provider: 'api',
        fell_back: false,
        latency_ms: 100,
      },
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('REWORK 02 变体: 章节正文只有 HTML 标签无文本 → invalid', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '业绩概览', content_html: '<p></p>', image_urls: [] },
          { heading: '关键进展', content_html: '<p>内容</p>', image_urls: [] },
        ],
        section_count: 2,
        provider: 'api',
        fell_back: false,
        latency_ms: 100,
      },
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('REWORK 02 变体: 章节 heading 缺失 → invalid', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '', content_html: '<p>内容</p>', image_urls: [] },
        ],
        section_count: 1,
        provider: 'api',
        fell_back: false,
        latency_ms: 100,
      },
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('REWORK 02 变体: 章节 image_urls 不是数组 → invalid', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '业绩概览', content_html: '<p>内容</p>', image_urls: 'broken' },
        ],
        section_count: 1,
        provider: 'api',
        fell_back: false,
        latency_ms: 100,
      },
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('REWORK 02 变体: HTTP 500 占位符 (章节生成失败) → invalid', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '业绩概览', content_html: '<p class="lx-muted">（章节生成失败: HTTP 500）</p>', image_urls: [] },
        ],
        section_count: 1,
        provider: 'api',
        fell_back: false,
        latency_ms: 100,
      },
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('REWORK 02 保留 happy path: 5 个有效章节 + 真实 LLM 内容 → success', () => {
    const r = {
      ok: true,
      data: {
        sections: [
          { heading: '业绩概览 · 季度汇报', content_html: '<p>本季度营收环比增长 <strong>18%</strong>，核心 KPI 全面达标。</p>', image_urls: [] },
          { heading: '关键进展', content_html: '<ul><li>新签约 3 家标杆客户</li><li>老客户续约率 92%</li><li>产品交付周期缩短 30%</li></ul>', image_urls: [] },
          { heading: '下季度计划', content_html: '<p>聚焦渠道拓展、产品化交付与客户成功体系建设。</p>', image_urls: [] },
          { heading: '风险与挑战', content_html: '<p>宏观需求恢复速度低于预期, 需提前预判行业拐点。</p>', image_urls: [] },
          { heading: '数据亮点', content_html: '<p><strong>18%</strong> 营收增长, <strong>92%</strong> 续约率, <strong>30%</strong> 交付提速。</p>', image_urls: [] },
        ],
        section_count: 5,
        provider: 'api',
        fell_back: false,
        latency_ms: 3500,
      },
    };
    const v = fc.validatePreviewGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
    expect(v.data.sections).toHaveLength(5);
  });
});

// ---- 4. output_generate ----
describe('validateOutputGenerate', () => {
  test('父级 PM 场景 4: status=failed, size_bytes=0, output_path=? → 不进 success', () => {
    const r = { ok: true, data: { status: 'failed', size_bytes: 0, output_path: '?', elapsed_ms: 0 } };
    const v = fc.validateOutputGenerate(r);
    // status=failed 优先, 进 failed
    expect(v.kind).toBe(fc.VERDICT.FAILED);
    expect(v.kind).not.toBe(fc.VERDICT.SUCCESS);
  });

  test('父级 PM 场景 4b: status 缺失但 size_bytes=0 → invalid', () => {
    const r = { ok: true, data: { output_path: '/tmp/test.pptx', size_bytes: 0 } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('父级 PM 场景 4c: output_path="?" → invalid', () => {
    const r = { ok: true, data: { output_path: '?', size_bytes: 1024, status: 'success' } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('父级 PM 场景 4d: output_path 缺失 → invalid', () => {
    const r = { ok: true, data: { size_bytes: 1024, status: 'success' } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('父级 PM 场景 4e: provider_status=mock 但 size>0 path 存在 → degraded', () => {
    // 真实合同: provider_status='mock' + fell_back=true (PM REPAIR 2026-07-14)
    const r = { ok: true, data: { output_path: '/tmp/test.pptx', size_bytes: 1024, status: 'success', provider_status: 'mock', fell_back: true } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
  });

  test('happy path: ok=true + status=ok + output_path 存在 + size>0 + provider_status=api + fell_back=false → success', () => {
    // 真实合同: /v1/output 返 status='ok', provider_status='api' (PM REPAIR)
    const r = { ok: true, data: { output_path: '/tmp/test.pptx', size_bytes: 102400, status: 'ok', provider_status: 'api', fell_back: false, elapsed_ms: 5000 } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
    expect(v.data.output_path).toBe('/tmp/test.pptx');
    expect(v.data.size_bytes).toBe(102400);
  });
});

// ---- 4b. validateOutputGenerate 【W3 PM REPAIR】真实合同 tests ----
// 真实合同: /v1/output 返 status=ok|failed, provider_status=api|mock|unavailable, fell_back bool
// (backend/daemon/server.py:474-510)
describe('validateOutputGenerate [real contract]', () => {
  test('真实 ok 合同: status=ok, provider_status=api, fell_back=false, size>0 → success', () => {
    const r = { ok: true, data: { status: 'ok', format: 'pdf', output_path: '/tmp/lingxi_w3_output_pdf_abc12345.pdf', size_bytes: 102400, elapsed_ms: 5000, provider_status: 'api', fell_back: false }, latency_ms: 5050 };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
    expect(v.data.provider_status).toBe('api');
  });

  test('真实 ok 合同: status=ok, provider_status=mock, fell_back=true → degraded', () => {
    const r = { ok: true, data: { status: 'ok', format: 'pdf', output_path: '/tmp/lingxi_w3_output_pdf_abc12345.pdf', size_bytes: 1024, elapsed_ms: 5, provider_status: 'mock', fell_back: true }, latency_ms: 10 };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
  });

  test('真实 ok 合同: status=ok, provider_status=unavailable → degraded', () => {
    const r = { ok: true, data: { status: 'ok', format: 'pptx', output_path: '/tmp/test.pptx', size_bytes: 2048, elapsed_ms: 0, provider_status: 'unavailable', fell_back: true }, latency_ms: 5 };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
  });

  test('真实 failed 合同: status=failed, size_bytes=0 → failed (PM 场景 4)', () => {
    // 父级 PM 复现: daemon unavailable → status=failed, size=0, path="?"
    const r = { ok: true, data: { status: 'failed', format: 'pdf', output_path: '?', size_bytes: 0, elapsed_ms: 0, error: 'html_path_not_found', provider_status: 'unavailable', fell_back: true }, latency_ms: 0 };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.FAILED);
  });

  test('真实 failed 合同: status=failed, size>0, output_path 存在 → 仍判 failed (status 优先)', () => {
    const r = { ok: true, data: { status: 'failed', format: 'pdf', output_path: '/tmp/half.pptx', size_bytes: 512, elapsed_ms: 30000, error: 'subprocess timeout 30s', provider_status: 'api', fell_back: false }, latency_ms: 30100 };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.FAILED);
  });

  test('PM REPAIR: provider_status=api + fell_back=false → success (真活)', () => {
    const r = { ok: true, data: { status: 'ok', format: 'pptx', output_path: '/tmp/ok.pptx', size_bytes: 102400, elapsed_ms: 5000, provider_status: 'api', fell_back: false } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
  });

  test('PM REPAIR: provider_status=live + fell_back=false → success (兼容旧命名)', () => {
    // 允许 live 作为 api 的别名 (旧 chat/import 端点仍用 live)
    const r = { ok: true, data: { status: 'ok', format: 'pptx', output_path: '/tmp/ok.pptx', size_bytes: 102400, elapsed_ms: 5000, provider_status: 'live', fell_back: false } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.SUCCESS);
  });

  test('PM REPAIR: 未知 status (非 ok/success/failed/error) → invalid', () => {
    const r = { ok: true, data: { status: 'pending', output_path: '/tmp/test.pptx', size_bytes: 1024, provider_status: 'api', fell_back: false } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('PM REPAIR: 未知 provider_status (非 api/live/mock/unavailable) → invalid', () => {
    const r = { ok: true, data: { status: 'ok', output_path: '/tmp/test.pptx', size_bytes: 1024, provider_status: 'weird-provider', fell_back: false } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });

  test('PM REPAIR: fell_back=true (即使 provider_status=api) → degraded (降级优先于 provider)', () => {
    const r = { ok: true, data: { status: 'ok', output_path: '/tmp/test.pptx', size_bytes: 1024, provider_status: 'api', fell_back: true } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.DEGRADED);
  });

  test('PM REPAIR: provider_status 缺失 → invalid', () => {
    const r = { ok: true, data: { status: 'ok', output_path: '/tmp/test.pptx', size_bytes: 1024, fell_back: false } };
    const v = fc.validateOutputGenerate(r);
    expect(v.kind).toBe(fc.VERDICT.INVALID);
  });
});

// ---- 通用 false-green 互斥性: 4 场景的 4 个父级 PM fixture 都不得返回 success ----
describe('parent PM evidence fixtures (cross-check)', () => {
  const fixtures = {
    file_kb: { ok: true, data: { files: 0, entries: 0 }, latency_ms: 12 },
    advisor: { ok: true, data: { content: 'hello (mock)' }, provider: 'undefined', elapsed_ms: 0 },
    preview: { ok: true, data: { sections: [{ heading: 'a' }, { heading: 'b' }, { heading: 'c' }, { heading: 'd' }, { heading: 'e' }], section_count: 5, provider: 'mock', fell_back: true, latency_ms: 0 } },
    output: { ok: true, data: { status: 'failed', size_bytes: 0, output_path: '?' } },
  };
  test('父级 PM 场景 1 file_kb → 非 success', () => {
    expect(fc.validateFileKbImport(fixtures.file_kb).kind).not.toBe(fc.VERDICT.SUCCESS);
  });
  test('父级 PM 场景 2 advisor → 非 success', () => {
    expect(fc.validateAdvisorChat(fixtures.advisor).kind).not.toBe(fc.VERDICT.SUCCESS);
  });
  test('父级 PM 场景 3 preview → 非 success', () => {
    expect(fc.validatePreviewGenerate(fixtures.preview).kind).not.toBe(fc.VERDICT.SUCCESS);
  });
  test('父级 PM 场景 4 output → 非 success', () => {
    expect(fc.validateOutputGenerate(fixtures.output).kind).not.toBe(fc.VERDICT.SUCCESS);
  });
});
