/**
 * test_north_star.test.ts — T-4.1 北极星 10 次 demo 验证 unit tests
 * 灵犀演示 · Phase 4 · Gate 4
 *
 * 覆盖：
 *   - test_north_star_records_per_run_metrics
 *   - test_north_star_aggregates_correctly
 *   - test_north_star_fails_fast_on_first_error（loop 注入 mock runOnce 验证 fail-fast 停 loop）
 *   - test_north_star_prd_thresholds_validate（gate 评估 + verdict）
 *   - test_north_star_report_md_format（renderMarkdown 输出格式校验）
 *
 * 设计：jest + ts-jest，纯 Node 环境，不依赖 daemon / subprocess。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  parseArgs,
  aggregate,
  runNorthStarLoop,
  emptyFormats,
  pad2,
  PRD_THRESHOLDS,
  type RunMetrics,
  type ParsedArgs,
} from '../north-star';
import { renderMarkdown } from '../north-star-report';

// ---- helpers ----

function mkRun(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    run_num: 1,
    success: true,
    retry_attempted: false,
    total_duration_ms: 2000,
    preview_html_latency_ms: 5000,
    advisor_latency_ms: 1500,
    memory_peak_mb: 512,
    formats: {
      pptx: { size_bytes: 73_000, ok: true },
      pdf: { size_bytes: 6_000, ok: true },
      docx: { size_bytes: 9_000, ok: true },
      html: { size_bytes: 4_000, ok: true },
    },
    daemon_port: 56140,
    fallback_used: false,
    started_at: '2026-07-10T10:00:00.000Z',
    finished_at: '2026-07-10T10:00:02.000Z',
    ...overrides,
  };
}

function mkArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    input: 'apps/desktop/testdata/quarterly_review',
    outputBase: '/tmp/north_star_test',
    recordDir: '/tmp/north_star_metrics_test',
    runs: 10,
    failFast: false,
    daemonPort: 56140,
    ...overrides,
  };
}

// ============================================================================
// test_north_star_records_per_run_metrics
// ============================================================================

test('test_north_star_records_per_run_metrics', () => {
  // 验证 RunMetrics 结构完整、字段类型正确
  const run = mkRun({ run_num: 7 });
  expect(run.run_num).toBe(7);
  expect(run.success).toBe(true);
  expect(run.retry_attempted).toBe(false);
  expect(typeof run.total_duration_ms).toBe('number');
  expect(typeof run.preview_html_latency_ms).toBe('number');
  expect(typeof run.advisor_latency_ms).toBe('number');
  expect(typeof run.memory_peak_mb).toBe('number');
  expect(typeof run.daemon_port).toBe('number');
  expect(typeof run.fallback_used).toBe('boolean');
  expect(typeof run.started_at).toBe('string');
  expect(typeof run.finished_at).toBe('string');

  // 4 格式都必填
  for (const fmt of ['pptx', 'pdf', 'docx', 'html'] as const) {
    expect(run.formats[fmt]).toBeDefined();
    expect(typeof run.formats[fmt].size_bytes).toBe('number');
    expect(typeof run.formats[fmt].ok).toBe('boolean');
  }

  // PRD 阈值常量 sanity check（防被无意改坏）
  expect(PRD_THRESHOLDS.PREVIEW_HTML_AVG_MAX_MS).toBe(10_000);
  expect(PRD_THRESHOLDS.ADVISOR_AVG_MAX_MS).toBe(3_000);
  expect(PRD_THRESHOLDS.MEMORY_MAX_MB).toBe(8 * 1024);

  // parseArgs 验证默认值 + 显式传值
  expect(parseArgs([]).runs).toBe(10);
  expect(parseArgs([]).failFast).toBe(false);
  expect(parseArgs(['--runs', '5']).runs).toBe(5);
  expect(parseArgs(['--fail-fast', 'true']).failFast).toBe(true);
  expect(parseArgs(['--daemon-port', '9999']).daemonPort).toBe(9999);
  expect(parseArgs(['--output-base', '/tmp/x']).outputBase).toBe('/tmp/x');

  // pad2 helper
  expect(pad2(1)).toBe('01');
  expect(pad2(10)).toBe('10');
  expect(pad2(99)).toBe('99');
});

// ============================================================================
// test_north_star_aggregates_correctly
// ============================================================================

test('test_north_star_aggregates_correctly', () => {
  // 10 个 mock run，前 9 个成功，第 10 个失败
  const runs: RunMetrics[] = [];
  for (let i = 1; i <= 9; i++) {
    runs.push(mkRun({
      run_num: i,
      preview_html_latency_ms: 1000 * i,           // 1000, 2000, ..., 9000
      advisor_latency_ms: 200 * i,                  // 200, 400, ..., 1800
      memory_peak_mb: 256 + 10 * i,                 // 256, 266, ..., 336
      total_duration_ms: 1500 + 50 * i,             // 1550, 1600, ..., 1900
      formats: {
        pptx: { size_bytes: 70_000 + 100 * i, ok: true },
        pdf: { size_bytes: 6_000 + 10 * i, ok: true },
        docx: { size_bytes: 9_000 + 10 * i, ok: true },
        html: { size_bytes: 4_000 + 10 * i, ok: true },
      },
    }));
  }
  runs.push(mkRun({
    run_num: 10,
    success: false,
    fail_reason: 'mock failure',
    formats: emptyFormats(),
    memory_peak_mb: 256,
  }));

  const agg = aggregate(runs);

  expect(agg.total_runs).toBe(10);
  expect(agg.success_count).toBe(9);
  expect(agg.success_rate).toBeCloseTo(0.9, 5);

  // avg_preview = mean(1000..9000) = 5000
  expect(agg.avg_preview_html_latency_ms).toBe(5000);
  // max_preview = 9000
  expect(agg.max_preview_html_latency_ms).toBe(9000);

  // avg_advisor = mean(200..1800) = 1000
  expect(agg.avg_advisor_latency_ms).toBe(1000);
  expect(agg.max_advisor_latency_ms).toBe(1800);

  // max_memory from ALL runs (including fail) = max(266..346, 256) = 346
  // (ok runs are 266..346; fail run is 256; max overall is 346 from i=9)
  expect(agg.max_memory_peak_mb).toBe(346);

  // format sizes: avg of ok runs only
  // pptx: 70000+100, 70100+100, ..., 70800+100 = mean = (70100+70200+...+70900)/9 = 70500
  expect(agg.format_avg_sizes.pptx).toBe(70500);
  expect(agg.format_min_sizes.pptx).toBe(70100);

  // format_ok_rate: 9/10 = 0.9
  expect(agg.format_ok_rate.pptx).toBe(0.9);

  // success_rate_10_of_10 应该 false（10 个里 1 个 fail）
  expect(agg.prd_gates.success_rate_10_of_10).toBe(false);
  // 其他 gate 因为 fail run 的 latency=0 / formats=空不影响成功 run 的 avg，应该都过
  expect(agg.prd_gates.preview_html_avg_under_10s).toBe(true);
  expect(agg.prd_gates.advisor_avg_under_3s).toBe(true);
  expect(agg.prd_gates.memory_under_8g).toBe(true);

  // verdict = FAIL 因为 success_rate_10_of_10 = false
  expect(agg.verdict).toBe('FAIL');
});

// ============================================================================
// test_north_star_prd_thresholds_validate
// ============================================================================

test('test_north_star_prd_thresholds_validate', () => {
  // 场景 A: 全部通过 → PASS
  const allPass = [];
  for (let i = 1; i <= 10; i++) {
    allPass.push(mkRun({
      run_num: i,
      preview_html_latency_ms: 3000,  // well under 10s
      advisor_latency_ms: 1000,        // well under 3s
      memory_peak_mb: 512,             // well under 8G
    }));
  }
  const aggA = aggregate(allPass);
  expect(aggA.verdict).toBe('PASS');
  expect(aggA.prd_gates.success_rate_10_of_10).toBe(true);
  expect(aggA.prd_gates.preview_html_avg_under_10s).toBe(true);
  expect(aggA.prd_gates.advisor_avg_under_3s).toBe(true);
  expect(aggA.prd_gates.memory_under_8g).toBe(true);

  // 场景 B: preview_html 刚好踩线（avg = 10000ms）→ 必须 PASS
  const exact10s = [];
  for (let i = 1; i <= 10; i++) {
    exact10s.push(mkRun({ run_num: i, preview_html_latency_ms: 10_000 }));
  }
  expect(aggregate(exact10s).verdict).toBe('PASS');
  expect(aggregate(exact10s).prd_gates.preview_html_avg_under_10s).toBe(true);

  // 场景 C: preview_html 超 1ms → FAIL
  const over10s = [];
  for (let i = 1; i <= 10; i++) {
    over10s.push(mkRun({ run_num: i, preview_html_latency_ms: 10_001 }));
  }
  expect(aggregate(over10s).verdict).toBe('FAIL');
  expect(aggregate(over10s).prd_gates.preview_html_avg_under_10s).toBe(false);

  // 场景 D: advisor 超 1ms → FAIL
  const over3s = [];
  for (let i = 1; i <= 10; i++) {
    over3s.push(mkRun({ run_num: i, advisor_latency_ms: 3_001 }));
  }
  expect(aggregate(over3s).verdict).toBe('FAIL');
  expect(aggregate(over3s).prd_gates.advisor_avg_under_3s).toBe(false);

  // 场景 E: 内存 8G 整 → PASS（边界）
  const mem8g = [];
  for (let i = 1; i <= 10; i++) {
    mem8g.push(mkRun({ run_num: i, memory_peak_mb: 8 * 1024 }));
  }
  expect(aggregate(mem8g).verdict).toBe('PASS');

  // 场景 F: 内存 8G + 1MB → FAIL
  const mem8gOver = [];
  for (let i = 1; i <= 10; i++) {
    mem8gOver.push(mkRun({ run_num: i, memory_peak_mb: 8 * 1024 + 1 }));
  }
  expect(aggregate(mem8gOver).verdict).toBe('FAIL');
  expect(aggregate(mem8gOver).prd_gates.memory_under_8g).toBe(false);

  // 场景 G: 1 个 run 失败 → success_rate_10_of_10 = false → FAIL
  const oneFail = allPass.slice();
  oneFail[4] = mkRun({ run_num: 5, success: false, fail_reason: 'mock', formats: emptyFormats() });
  expect(aggregate(oneFail).verdict).toBe('FAIL');
});

// ============================================================================
// test_north_star_fails_fast_on_first_error
// ============================================================================

test('test_north_star_fails_fast_on_first_error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-ns-failfast-'));
  const args: ParsedArgs = mkArgs({
    runs: 10,
    failFast: true,
    outputBase: tmpDir,
    recordDir: tmpDir,
  });

  // mock runOnceFn：第 1 次 fail，第 2 次 fail，第 3 次 fail，第 4+ 次 pass
  // 期望：fail-fast 触发 → loop 在 run 1 之后就 break（不等 retry 都失败）
  let callCount = 0;
  const mockRunOnce = async (runNum: number): Promise<RunMetrics> => {
    callCount++;
    return mkRun({
      run_num: runNum,
      success: false,
      fail_reason: `mock fail #${callCount}`,
      formats: emptyFormats(),
      memory_peak_mb: 256,
    });
  };

  const { runs, failedRetries } = await runNorthStarLoop(args, 56140, {
    runOnceFn: mockRunOnce as any,
  });

  // fail-fast：run 1 original fail → retry → 也 fail → 触发 fail-fast break
  // callCount 应该 = 2 (1 original + 1 retry)；runs 应该只有 1 个（带 retry fail reason）
  expect(callCount).toBe(2);
  expect(runs.length).toBe(1);
  expect(runs[0].success).toBe(false);
  expect(failedRetries.length).toBe(1);
  expect(failedRetries[0].run_num).toBe(1);
});

test('test_north_star_continues_without_fail_fast', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-ns-nofailfast-'));
  const args: ParsedArgs = mkArgs({
    runs: 3,
    failFast: false,
    outputBase: tmpDir,
    recordDir: tmpDir,
  });

  // mock：第 1 个 run fail (original + retry 也 fail)，第 2、3 个 pass
  // 期望：3 个 run 都跑完（fail-fast 不开）
  let callCount = 0;
  const mockRunOnce = async (runNum: number): Promise<RunMetrics> => {
    callCount++;
    if (runNum === 1) {
      return mkRun({
        run_num: runNum,
        success: false,
        fail_reason: `mock fail runNum=${runNum}`,
        formats: emptyFormats(),
      });
    }
    return mkRun({ run_num: runNum, success: true });
  };

  const { runs } = await runNorthStarLoop(args, 56140, {
    runOnceFn: mockRunOnce as any,
  });

  // run 1: 1 original + 1 retry = 2 calls
  // run 2: 1 call, run 3: 1 call = 4 total
  expect(callCount).toBe(4);
  expect(runs.length).toBe(3);
  expect(runs[0].success).toBe(false);
  expect(runs[1].success).toBe(true);
  expect(runs[2].success).toBe(true);
});

// ============================================================================
// test_north_star_report_md_format
// ============================================================================

test('test_north_star_report_md_format', () => {
  // 构造一个 10-run 全 pass 的 mock aggregate
  const runs: RunMetrics[] = [];
  for (let i = 1; i <= 10; i++) {
    runs.push(mkRun({
      run_num: i,
      preview_html_latency_ms: 3000,
      advisor_latency_ms: 800,
      memory_peak_mb: 480,
      total_duration_ms: 2000,
    }));
  }
  const agg = aggregate(runs);

  const md = renderMarkdown(agg, {
    inputDir: 'apps/desktop/testdata/quarterly_review',
    outputDir: '/tmp/north_star',
    daemonPort: 56140,
    screenshotDir: 'screenshots/T-4.1-north-star',
    recordDir: '/tmp/north_star_metrics',
    platform: 'macOS half (Win half 等 NJX 拍 VM SKU)',
  });

  // 必含：标题 / 表头 / 数据行 / 汇总 / gate / verdict
  expect(md).toContain('# 灵犀演示 — 北极星 10 次 demo 验证报告');
  expect(md).toContain('Plan-Id: T-4.1-macos-north-star');
  expect(md).toContain('平台: **macOS half (Win half 等 NJX 拍 VM SKU)**');
  expect(md).toContain('| run | success | retry | preview_html (ms) |');
  expect(md).toContain('| 01 | ✓ | 0 | 3000 | 800 | 480 |');
  expect(md).toContain('| 10 | ✓ | 0 | 3000 | 800 | 480 |');

  // 4 格式汇总
  expect(md).toContain('## 4. 4 格式输出文件 size 汇总');
  expect(md).toContain('| .pptx |');
  expect(md).toContain('| .pdf |');
  expect(md).toContain('| .docx |');
  expect(md).toContain('| .html |');

  // PRD 硬指标门卡
  expect(md).toContain('## 5. PRD 硬指标门卡');
  expect(md).toContain('10/10 成功');
  expect(md).toContain('平均 HTML 预览延迟 ≤ 10s');
  expect(md).toContain('平均 AI 响应延迟 ≤ 3s');
  expect(md).toContain('资源占用 ≤ 8G 内存');

  // 截图清单
  expect(md).toContain('## 6. 截图清单');
  expect(md).toContain('run_01.png');
  expect(md).toContain('run_10.png');
  expect(md).toContain('summary_dashboard.png');

  // 平台标注
  expect(md).toContain('## 7. 平台标注');
  expect(md).toContain('Win half 待 NJX 拍 Win VM SKU');

  // 验收信号 checklist
  expect(md).toContain('## 9. 验收信号');
  expect(md).toContain('[✓] 10 次 demo 全部成功');
  expect(md).toContain('[✓] 平均 HTML 预览延迟 ≤ 10s');
  expect(md).toContain('[✓] 平均 AI 响应延迟 ≤ 3s');
  expect(md).toContain('[✓] 资源占用 ≤ 8G');

  // VERDICT 行（最后）
  expect(md).toMatch(/## VERDICT: PASS\s*$/m);

  // 全部 10 个 run 都列出
  const tableLines = md.split('\n').filter((l) => /^\| 0[1-9]\s\|/.test(l) || /^\| 10\s\|/.test(l));
  expect(tableLines.length).toBe(10);
});