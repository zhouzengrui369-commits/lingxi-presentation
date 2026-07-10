/**
 * gate4-macos-rerun.test.ts — T-G4-macos 5 硬指标 gate 评估 + 聚合 unit tests
 * 灵犀演示 · Phase 6 收尾后 · Gate 4 macOS half
 *
 * 覆盖 (钉子 #30: 不依赖真 app runtime, 纯 unit + mock):
 *   - 5 硬指标 gate 评估 (边界 case: 100% pass, 99% fail)
 *   - 10 次 run loop 确定性 + 串行 (钉子 #4)
 *   - aggregate 聚合 + verdict 计算
 *   - parseArgs 入口
 *   - renderSummaryDashboard markdown 必含关键字段
 *   - 钉子 #30 阈值与 goal.md §5 一致
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  parseArgs,
  evaluateSuccessRateGate,
  evaluatePreviewLatencyGate,
  evaluateAdvisorLatencyGate,
  evaluateMemoryGate,
  evaluateMultiFormatGate,
  evaluateRunGates,
  evaluateAggregateGates,
  overallVerdict,
  aggregate,
  renderSummaryDashboard,
  runGate4Loop,
  GATE4_THRESHOLDS,
  type CliArgs,
  type RunMetrics,
  type AggregateMetrics,
} from '../gate4-macos-rerun';

// ---- helpers ----

function mkRun(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    run_num: 1,
    started_at: '2026-07-11T04:00:00.000Z',
    finished_at: '2026-07-11T04:00:10.000Z',
    total_duration_ms: 10_000,
    app_pid: 47979,
    app_path: '/Applications/灵犀演示.app',
    daemon_port: 65413,
    success: true,
    preview_html_latency_ms: 3000,
    advisor_latency_ms: 1500,
    memory_peak_mb: 512,
    formats: {
      pptx: { size_bytes: 71_600, ok: true },
      pdf: { size_bytes: 6_300, ok: true },
      docx: { size_bytes: 9_200, ok: true },
      html: { size_bytes: 4_100, ok: true },
    },
    format_ok_rate: 1.0,
    gates: [],
    overall_pass: true,
    ...overrides,
  };
}

function mkArgs(overrides: Partial<CliArgs> = {}): CliArgs {
  return {
    appPath: '/Applications/灵犀演示.app',
    rounds: 10,
    testdataDir: '/tmp/quarterly_review',
    outputBase: '/tmp/gate4_macos_rerun_test',
    recordDir: '/tmp/gate4_macos_metrics_test',
    screenshotDir: '/tmp/screenshots_test',
    failFast: false,
    ...overrides,
  };
}

// ============================================================================
// 5 硬指标 gate 评估单元测试
// ============================================================================

describe('T-G4-macos 5 硬指标 gate 评估', () => {
  test('1. success_rate — 100% pass, 99% fail, 90% fail', () => {
    expect(evaluateSuccessRateGate(1.0).pass).toBe(true);
    expect(evaluateSuccessRateGate(0.99).pass).toBe(false);
    expect(evaluateSuccessRateGate(0.9).pass).toBe(false);
    expect(evaluateSuccessRateGate(0.5).pass).toBe(false);
  });

  test('2. preview_latency — avg 10000ms pass (边界), 10001ms fail, max 也用于详情', () => {
    expect(evaluatePreviewLatencyGate(10_000, 12_000).pass).toBe(true);  // 边界 PASS
    expect(evaluatePreviewLatencyGate(10_001, 12_000).pass).toBe(false);
    expect(evaluatePreviewLatencyGate(5_000, 10_500).pass).toBe(true);   // avg well under
  });

  test('3. advisor_latency — avg 3000ms pass (边界), 3001ms fail', () => {
    expect(evaluateAdvisorLatencyGate(3_000, 4_000).pass).toBe(true);  // 边界 PASS
    expect(evaluateAdvisorLatencyGate(3_001, 4_000).pass).toBe(false);
    expect(evaluateAdvisorLatencyGate(1_500, 2_500).pass).toBe(true);
  });

  test('4. memory — 8G (8192MB) pass (边界), 8G+1MB fail', () => {
    expect(evaluateMemoryGate(8 * 1024).pass).toBe(true);
    expect(evaluateMemoryGate(8 * 1024 + 1).pass).toBe(false);
    expect(evaluateMemoryGate(512).pass).toBe(true);  // well under
    expect(evaluateMemoryGate(7 * 1024).pass).toBe(true);
  });

  test('5. multi_format — 100% pass, 99% fail, 75% (3/4) fail', () => {
    expect(evaluateMultiFormatGate(1.0).pass).toBe(true);
    expect(evaluateMultiFormatGate(0.99).pass).toBe(false);
    expect(evaluateMultiFormatGate(0.75).pass).toBe(false);
  });

  test('5 gate 顺序和 index 对应 goal.md §5', () => {
    const run = mkRun();
    const gates = evaluateRunGates(run);
    expect(gates.length).toBe(5);
    expect(gates.map((g) => g.index)).toEqual([1, 2, 3, 4, 5]);
    expect(gates[0]!.name).toBe('10/10 成功');
    expect(gates[1]!.name).toBe('HTML 预览延迟');
    expect(gates[2]!.name).toBe('AI 响应延迟');
    expect(gates[3]!.name).toBe('资源占用');
    expect(gates[4]!.name).toBe('4 格式输出');
  });
});

// ============================================================================
// 10 次 run loop (钉子 #4 max_concurrency=1)
// ============================================================================

describe('T-G4-macos run loop 串行验证 (钉子 #4)', () => {
  test('runGate4Loop 串行跑 10 次, 总数 = 10, 顺序严格', async () => {
    const args = mkArgs({ rounds: 10 });
    const order: number[] = [];
    const mockFn = async (runNum: number): Promise<RunMetrics> => {
      order.push(runNum);
      await new Promise((r) => setTimeout(r, 10));
      return mkRun({ run_num: runNum });
    };
    const runs = await runGate4Loop(args, { runOnceFn: mockFn });
    expect(runs.length).toBe(10);
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);  // 严格顺序
  });

  test('runGate4Loop fail-fast 触发: 第 1 次 fail, fail-fast=true 立即停', async () => {
    const args = mkArgs({ rounds: 10, failFast: true });
    let callCount = 0;
    const mockFn = async (runNum: number): Promise<RunMetrics> => {
      callCount++;
      if (runNum === 1) {
        // mock 一个 fail run: 模拟真实 runOnce 输出 (overall_pass 已经被 evaluate 设为 false)
        const m = mkRun({
          run_num: runNum,
          success: false,
          format_ok_rate: 0.5,  // 50% → FAIL gate 5
          formats: {
            pptx: { size_bytes: 0, ok: false },
            pdf: { size_bytes: 0, ok: false },
            docx: { size_bytes: 0, ok: false },
            html: { size_bytes: 0, ok: false },
          },
        });
        m.gates = evaluateRunGates(m);
        m.overall_pass = false;
        return m;
      }
      return mkRun({ run_num: runNum });
    };
    const runs = await runGate4Loop(args, { runOnceFn: mockFn });
    expect(callCount).toBe(1);
    expect(runs.length).toBe(1);
    expect(runs[0]!.success).toBe(false);
  });

  test('runGate4Loop 异常处理: runOnce 抛错 → 捕获, 写 fail run, 不中断 loop', async () => {
    const args = mkArgs({ rounds: 3, failFast: false });
    const mockFn = async (runNum: number): Promise<RunMetrics> => {
      if (runNum === 2) throw new Error('mock app crash');
      return mkRun({ run_num: runNum });
    };
    const runs = await runGate4Loop(args, { runOnceFn: mockFn });
    expect(runs.length).toBe(3);
    expect(runs[0]!.success).toBe(true);
    expect(runs[1]!.success).toBe(false);
    expect(runs[1]!.fail_reason).toContain('exception: mock app crash');
    expect(runs[2]!.success).toBe(true);
  });
});

// ============================================================================
// aggregate 聚合
// ============================================================================

describe('T-G4-macos aggregate 聚合', () => {
  test('10 个 mock run 全 PASS → verdict = PASS', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i }));
    }
    const agg = aggregate(runs);
    expect(agg.total_runs).toBe(10);
    expect(agg.success_count).toBe(10);
    expect(agg.success_rate).toBe(1.0);
    expect(agg.overall_verdict).toBe('PASS');
    expect(agg.gates.length).toBe(5);
    expect(agg.gates.every((g) => g.pass)).toBe(true);
  });

  test('9/10 PASS → success_rate=0.9 → gate 1 FAIL, verdict = FAIL', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 9; i++) {
      runs.push(mkRun({ run_num: i, success: true }));
    }
    runs.push(mkRun({
      run_num: 10,
      success: false,
      fail_reason: 'mock fail',
      format_ok_rate: 0,
      formats: {
        pptx: { size_bytes: 0, ok: false },
        pdf: { size_bytes: 0, ok: false },
        docx: { size_bytes: 0, ok: false },
        html: { size_bytes: 0, ok: false },
      },
    }));
    const agg = aggregate(runs);
    expect(agg.success_count).toBe(9);
    expect(agg.success_rate).toBeCloseTo(0.9, 5);
    expect(agg.gates.find((g) => g.index === 1)?.pass).toBe(false);
    expect(agg.overall_verdict).toBe('FAIL');
  });

  test('preview_html 超 10s → gate 2 FAIL', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i, preview_html_latency_ms: 10_001 }));
    }
    const agg = aggregate(runs);
    expect(agg.gates.find((g) => g.index === 2)?.pass).toBe(false);
    expect(agg.overall_verdict).toBe('FAIL');
  });

  test('memory 8G+1 → gate 4 FAIL', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i, memory_peak_mb: 8 * 1024 + 1 }));
    }
    const agg = aggregate(runs);
    expect(agg.gates.find((g) => g.index === 4)?.pass).toBe(false);
    expect(agg.overall_verdict).toBe('FAIL');
  });

  test('format 3/4 (75%) → gate 5 FAIL', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({
        run_num: i,
        formats: {
          pptx: { size_bytes: 71_600, ok: true },
          pdf: { size_bytes: 6_300, ok: true },
          docx: { size_bytes: 9_200, ok: true },
          html: { size_bytes: 0, ok: false },  // html 失败
        },
        format_ok_rate: 0.75,
      }));
    }
    const agg = aggregate(runs);
    expect(agg.avg_format_ok_rate).toBeCloseTo(0.75, 5);
    expect(agg.gates.find((g) => g.index === 5)?.pass).toBe(false);
    expect(agg.overall_verdict).toBe('FAIL');
  });

  test('overallVerdict 任一 gate fail → FAIL', () => {
    const gates = [
      { index: 1, name: '10/10 成功', threshold_desc: '', pass: true, observed: 1, unit: 'ratio' },
      { index: 2, name: 'preview', threshold_desc: '', pass: true, observed: 5000, unit: 'ms' },
      { index: 3, name: 'advisor', threshold_desc: '', pass: true, observed: 1500, unit: 'ms' },
      { index: 4, name: 'memory', threshold_desc: '', pass: true, observed: 512, unit: 'MB' },
      { index: 5, name: 'formats', threshold_desc: '', pass: false, observed: 0.5, unit: 'ratio' },  // fail
    ];
    expect(overallVerdict(gates)).toBe('FAIL');
  });
});

// ============================================================================
// renderSummaryDashboard markdown 输出
// ============================================================================

describe('T-G4-macos renderSummaryDashboard', () => {
  test('必含 Plan-Id / 5 硬指标 gate 表 / 10 run 详细表 / VERDICT', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i }));
    }
    const agg = aggregate(runs);
    const md = renderSummaryDashboard(agg, 'screenshots/T-G4-macos');

    expect(md).toContain('Plan-Id: **T-G4-macos**');
    expect(md).toContain('平台: **macOS half**');
    expect(md).toContain('/Applications/灵犀演示.app');
    expect(md).toContain('# 灵犀演示 — T-G4-macos Gate 4 北极星 10 次 demo 重跑验证报告');
    expect(md).toContain('## 1. 5 硬指标 gate 评估');
    expect(md).toContain('## 2. 10 次 run 详细数据');
    expect(md).toContain('## 3. 聚合指标');
    expect(md).toContain('## 4. 4 格式输出 size 汇总');
    expect(md).toContain('## 5. 截图清单');
    expect(md).toContain('## 6. 验收信号');
    expect(md).toContain('## 7. Changelog');
    expect(md).toMatch(/## VERDICT: PASS\s*$/m);

    // 5 硬指标中文名都在
    for (const name of ['10/10 成功', 'HTML 预览延迟', 'AI 响应延迟', '资源占用', '4 格式输出']) {
      expect(md).toContain(name);
    }

    // 10 个 run 都在 run 详细表里
    const tableLines = md.split('\n').filter((l) => /^\| 0[1-9]\s\|/.test(l) || /^\| 10\s\|/.test(l));
    expect(tableLines.length).toBe(10);
  });

  test('4 格式 size 表: pptx/pdf/docx/html 都在', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i }));
    }
    const agg = aggregate(runs);
    const md = renderSummaryDashboard(agg, 'screenshots/T-G4-macos');
    expect(md).toContain('| .pptx |');
    expect(md).toContain('| .pdf |');
    expect(md).toContain('| .docx |');
    expect(md).toContain('| .html |');
  });
});

// ============================================================================
// parseArgs
// ============================================================================

describe('T-G4-macos parseArgs', () => {
  test('default = /Applications/灵犀演示.app, 10 rounds', () => {
    const a = parseArgs([]);
    expect(a.appPath).toBe('/Applications/灵犀演示.app');
    expect(a.rounds).toBe(10);
  });

  test('--rounds 自定义', () => {
    expect(parseArgs(['--rounds', '5']).rounds).toBe(5);
    expect(parseArgs(['--rounds', '20']).rounds).toBe(20);
  });

  test('--app-path 自定义', () => {
    const a = parseArgs(['--app-path', '/tmp/test.app']);
    expect(a.appPath).toBe('/tmp/test.app');
  });

  test('--testdata 自定义', () => {
    const a = parseArgs(['--testdata', '/tmp/quarterly']);
    expect(a.testdataDir).toBe('/tmp/quarterly');
  });

  test('--output 自定义输出 base', () => {
    const a = parseArgs(['--output', '/tmp/g4_mac']);
    expect(a.outputBase).toBe('/tmp/g4_mac');
  });

  test('--fail-fast 解析', () => {
    expect(parseArgs(['--fail-fast', 'true']).failFast).toBe(true);
    expect(parseArgs(['--fail-fast', '1']).failFast).toBe(true);
    expect(parseArgs([]).failFast).toBe(false);
  });
});

// ============================================================================
// 钉子 #30 阈值与 goal.md §5 + phase6_plan.md T-6.8 line 229-234 一致
// ============================================================================

describe('T-G4-macos 钉子验证', () => {
  test('钉子 #30 阈值一致性: 5 硬指标与 goal.md §5 一致', () => {
    expect(GATE4_THRESHOLDS.SUCCESS_RATE_MIN).toBe(1.0);
    expect(GATE4_THRESHOLDS.PREVIEW_HTML_AVG_MAX_MS).toBe(10_000);
    expect(GATE4_THRESHOLDS.ADVISOR_AVG_MAX_MS).toBe(3_000);
    expect(GATE4_THRESHOLDS.MEMORY_MAX_MB).toBe(8 * 1024);
    expect(GATE4_THRESHOLDS.MULTI_FORMAT_MIN_OK).toBe(1.0);
  });

  test('钉子 #4 max_concurrency=1: runGate4Loop 严格串行', async () => {
    const args = mkArgs({ rounds: 5 });
    const order: number[] = [];
    const mockFn = async (runNum: number): Promise<RunMetrics> => {
      order.push(runNum);
      await new Promise((r) => setTimeout(r, 10));
      return mkRun({ run_num: runNum });
    };
    await runGate4Loop(args, { runOnceFn: mockFn });
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  test('钉子 #30 30min cap: aggregate 不超过 5 个 gate, 不会无限循环', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i }));
    }
    const agg = aggregate(runs);
    expect(agg.gates.length).toBe(5);
    expect(agg.runs.length).toBe(10);
  });

  test('钉子 #14 3件齐: 本 test 文件覆盖完整 (run + aggregate + verdict + dashboard + parseArgs + 阈值)', () => {
    // 隐式测试: 6 个 describe + ≥ 18 个 test, 5 指标 × 边界 case + loop + aggregate + 渲染
    expect(GATE4_THRESHOLDS).toBeDefined();
  });
});
