/**
 * test_real_runtime_validate.test.ts — T-6.3 9 硬指标 harness 自身 10 次 demo 验证
 * 灵犀演示 · Phase 6 · T-6.3
 *
 * 覆盖 (钉子 #30: 不依赖真 app runtime, 纯 unit + mock):
 *   - 9 硬指标 gate 评估 (边界 case: 99% pass, 88.89% fail)
 *   - 10 次 harness run loop 确定性 + 串行 (钉子 #4)
 *   - aggregate 聚合 + verdict 计算
 *   - 3 mode (harness / real-cli / real-app) 入口正确分流
 *   - renderSummaryDashboard markdown 必含关键字段
 *   - 钉子 #1 weasyprint adapter 接口契约
 */

import {
  parseArgs,
  evaluateImportGate,
  evaluateAiLatencyGate,
  evaluateHtmlPreviewGate,
  evaluateAdvisorOptionRatioGate,
  evaluateTemplateMatchRateGate,
  evaluateVoiceAccuracyGate,
  evaluateMemoryGate,
  evaluatePptxEditableGate,
  evaluatePdfNoGarbledGate,
  evaluateRunGates,
  overallVerdict,
  runHarnessOnce,
  runValidationLoop,
  aggregate,
  renderSummaryDashboard,
  HARD_GATE_THRESHOLDS,
  type CliArgs,
  type RunMetrics,
} from '../real-runtime-validate';

import {
  checkWeasyprintAvailable,
  resolveWeasyprintPath,
  writePdfWeasyprint,
  WeasyprintNotAvailableError,
} from '../../src/modules/output/pdf_writer_weasyprint';

// ---- helpers ----

function mkRun(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    run_num: 1,
    started_at: '2026-07-11T00:00:00.000Z',
    finished_at: '2026-07-11T00:00:01.000Z',
    total_duration_ms: 1000,
    mode: 'harness',
    import_success_rate: 1.0,
    import_total: 5,
    import_failed: 0,
    ai_latency_ms: 500,
    html_preview_latency_ms: 2000,
    advisor_option_ratio: 1.0,
    template_match_rate: 1.0,
    template_id: 'builtin_business_dark',
    voice_accuracy: 0.97,
    voice_pool_size: 10,
    memory_peak_mb: 512,
    pptx_editable: true,
    pdf_no_garbled: true,
    gates: [],
    overall_pass: true,
    ...overrides,
  };
}

function mkArgs(overrides: Partial<CliArgs> = {}): CliArgs {
  return {
    mode: 'harness',
    runs: 10,
    inputDir: '/tmp/quarterly_review',
    outputBase: '/tmp/real_runtime_validate_test',
    recordDir: '/tmp/real_runtime_metrics_test',
    screenshotDir: '/tmp/screenshots_test',
    failFast: false,
    ...overrides,
  };
}

// ============================================================================
// 9 硬指标 gate 评估单元测试
// ============================================================================

describe('T-6.3 9 硬指标 gate 评估', () => {
  test('1. 文件导入成功率 — 99% pass, 98% fail', () => {
    expect(evaluateImportGate(0.99).pass).toBe(true);
    expect(evaluateImportGate(1.0).pass).toBe(true);
    expect(evaluateImportGate(0.98).pass).toBe(false);
    expect(evaluateImportGate(0.5).pass).toBe(false);
  });

  test('2. AI 响应延迟 — avg 3000ms pass, avg 3001ms fail, max 5000 pass, max 5001 fail', () => {
    expect(evaluateAiLatencyGate(3000, 5000).pass).toBe(true);
    expect(evaluateAiLatencyGate(3001, 5000).pass).toBe(false);  // avg 超
    expect(evaluateAiLatencyGate(3000, 5001).pass).toBe(false);  // max 超
  });

  test('3. HTML 预览延迟 — avg 10000ms pass, avg 10001ms fail, max 15000 pass', () => {
    expect(evaluateHtmlPreviewGate(10000, 15000).pass).toBe(true);
    expect(evaluateHtmlPreviewGate(10001, 15000).pass).toBe(false);
    expect(evaluateHtmlPreviewGate(10000, 15001).pass).toBe(false);
  });

  test('4. 顾问带选项比例 — 90% pass, 89.99% fail', () => {
    expect(evaluateAdvisorOptionRatioGate(0.90).pass).toBe(true);
    expect(evaluateAdvisorOptionRatioGate(1.0).pass).toBe(true);
    expect(evaluateAdvisorOptionRatioGate(0.8999).pass).toBe(false);
    // 边界: 8/9 = 88.89% (quarterly_review scenario 真实情况)
    expect(evaluateAdvisorOptionRatioGate(8 / 9).pass).toBe(false);
  });

  test('5. 模板匹配度 — 100% pass, 99.9% fail', () => {
    expect(evaluateTemplateMatchRateGate(1.0, 'builtin_business_dark').pass).toBe(true);
    expect(evaluateTemplateMatchRateGate(0.999, 'builtin_business_dark').pass).toBe(false);
  });

  test('6. voice 准确率 — 95% pass, 94.99% fail', () => {
    expect(evaluateVoiceAccuracyGate(0.95, 0.95, 10).pass).toBe(true);
    expect(evaluateVoiceAccuracyGate(0.9499, 0.95, 10).pass).toBe(false);
  });

  test('7. 资源占用 — 8G (8192MB) pass, 8G+1MB fail', () => {
    expect(evaluateMemoryGate(8 * 1024).pass).toBe(true);
    expect(evaluateMemoryGate(8 * 1024 + 1).pass).toBe(false);
  });

  test('8. PPTX 可编辑 — 全 10/10 pass, 9/10 fail', () => {
    expect(evaluatePptxEditableGate(10, 10).pass).toBe(true);
    expect(evaluatePptxEditableGate(9, 10).pass).toBe(false);
  });

  test('9. PDF 无格式错乱 — 全 10/10 pass, 9/10 fail', () => {
    expect(evaluatePdfNoGarbledGate(10, 10).pass).toBe(true);
    expect(evaluatePdfNoGarbledGate(9, 10).pass).toBe(false);
  });

  test('9 gate 顺序和 index 对应 phase6_plan.md line 130-138', () => {
    const run = mkRun();
    const gates = evaluateRunGates(run);
    expect(gates.length).toBe(9);
    expect(gates.map((g) => g.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(gates[0]!.name).toBe('文件导入成功率');
    expect(gates[1]!.name).toBe('AI 响应延迟');
    expect(gates[2]!.name).toBe('HTML 预览延迟');
    expect(gates[3]!.name).toBe('顾问带选项比例');
    expect(gates[4]!.name).toBe('模板匹配度');
    expect(gates[5]!.name).toBe('voice 准确率');
    expect(gates[6]!.name).toBe('资源占用');
    expect(gates[7]!.name).toBe('PPTX 可编辑');
    expect(gates[8]!.name).toBe('PDF 无格式错乱');
  });
});

// ============================================================================
// harness 模式 10 次 run
// ============================================================================

describe('T-6.3 harness 模式 10 次 run (钉子 #4 max_concurrency=1)', () => {
  test('runHarnessOnce 单次跑产出 9 指标 + gates', async () => {
    const r = await runHarnessOnce(1);
    expect(r.run_num).toBe(1);
    expect(r.mode).toBe('harness');
    expect(r.gates.length).toBe(9);
    expect(r.total_duration_ms).toBeGreaterThan(0);
    // harness 默认 9 指标全 OK → overall_pass = true
    expect(r.overall_pass).toBe(true);
    // import 5 文件, 0 失败
    expect(r.import_total).toBe(5);
    expect(r.import_failed).toBe(0);
    expect(r.import_success_rate).toBe(1.0);
  });

  test('runHarnessOnce 10 次跑确定性 (不随机, 钉子 #30)', async () => {
    // 第 5 次跑两次, 应该得到完全一样的 metrics (除 timestamp)
    const a = await runHarnessOnce(5);
    const b = await runHarnessOnce(5);
    expect(a.ai_latency_ms).toBe(b.ai_latency_ms);
    expect(a.html_preview_latency_ms).toBe(b.html_preview_latency_ms);
    expect(a.voice_accuracy).toBe(b.voice_accuracy);
    expect(a.memory_peak_mb).toBe(b.memory_peak_mb);
  });

  test('runValidationLoop 串行跑 10 次, 总数 = 10 (钉子 #4)', async () => {
    const args = mkArgs({ runs: 10 });
    const runs = await runValidationLoop(args);
    expect(runs.length).toBe(10);
    // 10 个 run 序号 1-10 (numeric sort, 避免 "10" 排在 "2" 前的字符串排序坑)
    expect(runs.map((r) => r.run_num).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('runValidationLoop fail-fast 触发: 第 1 次 fail, 后面都 pass, fail-fast=true 应只跑 1 次', async () => {
    const args = mkArgs({ runs: 10, failFast: true });
    let callCount = 0;
    const mockFn = async (runNum: number): Promise<RunMetrics> => {
      callCount++;
      if (runNum === 1) {
        return mkRun({
          run_num: runNum,
          overall_pass: false,
          import_success_rate: 0.5,  // 50% → FAIL gate 1
        });
      }
      return mkRun({ run_num: runNum, overall_pass: true });
    };
    const runs = await runValidationLoop(args, { runOnceFn: mockFn });
    expect(callCount).toBe(1);  // fail-fast 第 1 次 fail 就停
    expect(runs.length).toBe(1);
    expect(runs[0]!.overall_pass).toBe(false);
  });
});

// ============================================================================
// aggregate 聚合
// ============================================================================

describe('T-6.3 aggregate 聚合', () => {
  test('10 个 mock run 全 PASS → verdict = PASS', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i }));
    }
    const agg = aggregate(runs);
    expect(agg.total_runs).toBe(10);
    expect(agg.success_count).toBe(10);
    expect(agg.overall_verdict).toBe('PASS');
    expect(agg.gates.length).toBe(9);
    expect(agg.gates.every((g) => g.pass)).toBe(true);
  });

  test('advisor_option_ratio 8/9 = 88.89% (quarterly_review 真实场景) → gate 4 FAIL, verdict = FAIL', () => {
    // 模拟 8/9 = 88.89% 真实场景, 验证 harness 能正确捕捉 FAIL
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i, advisor_option_ratio: 8 / 9 }));
    }
    const agg = aggregate(runs);
    // avgFloat 保留 4 位精度, 8/9 = 0.8889 (vs expected 0.888888..., diff ~ 0.0000111)
    expect(agg.advisor_option_ratio_avg).toBeCloseTo(8 / 9, 3);
    const gate4 = agg.gates.find((g) => g.index === 4);
    expect(gate4?.pass).toBe(false);
    expect(agg.overall_verdict).toBe('FAIL');
  });

  test('memory 8G+1 → gate 7 FAIL', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i, memory_peak_mb: 8 * 1024 + 1 }));
    }
    const agg = aggregate(runs);
    expect(agg.gates.find((g) => g.index === 7)?.pass).toBe(false);
    expect(agg.overall_verdict).toBe('FAIL');
  });

  test('5 文件/次 × 10 次 = 50 文件, 0 失败 → import 100%', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i, import_total: 5, import_failed: 0 }));
    }
    const agg = aggregate(runs);
    expect(agg.import_total_files).toBe(50);
    expect(agg.import_failed_files).toBe(0);
    expect(agg.import_success_rate_avg).toBe(1.0);
  });

  test('overallVerdict 任一 gate fail → FAIL', () => {
    const gates = [
      { ...evaluateImportGate(1.0), pass: true },
      { ...evaluateAiLatencyGate(1000, 2000), pass: true },
      { ...evaluateHtmlPreviewGate(2000, 3000), pass: true },
      { ...evaluateAdvisorOptionRatioGate(1.0), pass: true },
      { ...evaluateTemplateMatchRateGate(1.0, 'builtin_business_dark'), pass: true },
      { ...evaluateVoiceAccuracyGate(0.97, 0.97, 10), pass: true },
      { ...evaluateMemoryGate(512), pass: true },
      { ...evaluatePptxEditableGate(10, 10), pass: true },
      { ...evaluatePdfNoGarbledGate(10, 10), pass: false },  // 这一项 fail
    ];
    expect(overallVerdict(gates)).toBe('FAIL');
  });
});

// ============================================================================
// renderSummaryDashboard markdown 必含字段
// ============================================================================

describe('T-6.3 renderSummaryDashboard markdown 输出', () => {
  test('必含 Plan-Id / 模式 / 9 硬指标 gate 表 / 10 run 详细表 / VERDICT', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i }));
    }
    const agg = aggregate(runs);
    const md = renderSummaryDashboard(agg);

    expect(md).toContain('Plan-Id: T-6.3-runtime-validation');
    expect(md).toContain('模式: **harness**');
    expect(md).toContain('# 灵犀演示 — T-6.3 真 runtime 9 硬指标 10 次 demo 验证报告');
    expect(md).toContain('## 1. 9 硬指标 gate 评估');
    expect(md).toContain('## 2. 10 次 run 详细数据');
    expect(md).toContain('## 3. 聚合指标');
    expect(md).toContain('## 4. 截图清单');
    expect(md).toContain('## 5. 验收信号');
    expect(md).toContain('## 6. Changelog');
    expect(md).toMatch(/## VERDICT: PASS\s*$/m);

    // 9 硬指标中文名都在
    for (const name of ['文件导入成功率', 'AI 响应延迟', 'HTML 预览延迟', '顾问带选项比例', '模板匹配度', 'voice 准确率', '资源占用', 'PPTX 可编辑', 'PDF 无格式错乱']) {
      expect(md).toContain(name);
    }

    // 10 个 run 都在 run 详细表里
    const tableLines = md.split('\n').filter((l) => /^\| 0[1-9]\s\|/.test(l) || /^\| 10\s\|/.test(l));
    expect(tableLines.length).toBe(10);
  });
});

// ============================================================================
// parseArgs
// ============================================================================

describe('T-6.3 parseArgs', () => {
  test('default = harness mode, 10 runs', () => {
    const a = parseArgs([]);
    expect(a.mode).toBe('harness');
    expect(a.runs).toBe(10);
  });

  test('--real-cli 切换 mode', () => {
    const a = parseArgs(['--real-cli', '--daemon-port', '56140']);
    expect(a.mode).toBe('real-cli');
    expect(a.daemonPort).toBe(56140);
  });

  test('--real-app 切换 mode + app-path', () => {
    const a = parseArgs(['--real-app', '--app-path', '/Applications/灵犀演示.app']);
    expect(a.mode).toBe('real-app');
    expect(a.appPath).toBe('/Applications/灵犀演示.app');
  });

  test('--runs 自定义跑批次数', () => {
    expect(parseArgs(['--runs', '5']).runs).toBe(5);
    expect(parseArgs(['--runs', '20']).runs).toBe(20);
  });

  test('--fail-fast 解析', () => {
    expect(parseArgs(['--fail-fast', 'true']).failFast).toBe(true);
    expect(parseArgs(['--fail-fast', '1']).failFast).toBe(true);
    expect(parseArgs([]).failFast).toBe(false);
  });
});

// ============================================================================
// 钉子 #1 weasyprint adapter 接口契约 (不依赖真 weasyprint 安装)
// ============================================================================

describe('T-6.3 钉子 #1 PDF CJK 修 weasyprint adapter', () => {
  test('resolveWeasyprintPath: 没装返回 null, 装了返回路径', () => {
    const p = resolveWeasyprintPath();
    if (p) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    } else {
      expect(p).toBeNull();
    }
  });

  test('checkWeasyprintAvailable: 返回结构完整', () => {
    const r = checkWeasyprintAvailable();
    expect(r).toHaveProperty('available');
    expect(r).toHaveProperty('path');
    expect(r).toHaveProperty('version');
    expect(r).toHaveProperty('install_hint');
    if (!r.available) {
      expect(r.install_hint.length).toBeGreaterThan(0);  // 必给安装提示
    }
  });

  test('writePdfWeasyprint: weasyprint 不可用时抛 WeasyprintNotAvailableError', async () => {
    // 强制走一个不存在的 path
    const fakePath = '/nonexistent/weasyprint';
    const payload = {
      doc_title: '测试',
      sections: [{ heading: 'h1', content_html: '<p>正文</p>', image_urls: [] }],
      style: {
        theme: 'light' as const,
        palette: {
          primary: '#2563eb',
          secondary: '#0ea5e9',
          background: '#ffffff',
          surface: '#f8fafc',
          text: '#0f172a',
          muted: '#64748b',
        },
        fonts: { heading: 'sans-serif', body: 'sans-serif' },
      },
      preview_id: 'test',
    };
    await expect(writePdfWeasyprint(payload, '/tmp/test_weasyprint.pdf', { weasyprintPath: fakePath })).rejects.toBeInstanceOf(
      WeasyprintNotAvailableError,
    );
  });
});

// ============================================================================
// 钉子 #14 3件齐 + 钉子 #30 30min cap — 终态 (本 test 文件覆盖完整)
// ============================================================================

describe('T-6.3 钉子验证', () => {
  test('钉子 #4 max_concurrency=1: loop 串行验证', async () => {
    // runValidationLoop 内部不并发 — 验证顺序: 第 i 次跑一定在第 i+1 次前完成
    const args = mkArgs({ runs: 5 });
    const order: number[] = [];
    const mockFn = async (runNum: number): Promise<RunMetrics> => {
      order.push(runNum);
      // 加 sleep 验证串行
      await new Promise((r) => setTimeout(r, 10));
      return mkRun({ run_num: runNum });
    };
    await runValidationLoop(args, { runOnceFn: mockFn });
    expect(order).toEqual([1, 2, 3, 4, 5]);  // 严格顺序, 不并发
  });

  test('钉子 #30 30min cap: aggregate 不超过 9 个 gate, 不会无限循环', () => {
    const runs: RunMetrics[] = [];
    for (let i = 1; i <= 10; i++) {
      runs.push(mkRun({ run_num: i }));
    }
    const agg = aggregate(runs);
    expect(agg.gates.length).toBe(9);  // 9 个 gate, 不多不少
    expect(agg.runs.length).toBe(10);
  });

  test('HARD_GATE_THRESHOLDS 钉子 R-6.3 阈值与 phase6_plan.md line 130-138 一致', () => {
    expect(HARD_GATE_THRESHOLDS.IMPORT_SUCCESS_RATE_MIN).toBe(0.99);
    expect(HARD_GATE_THRESHOLDS.AI_LATENCY_AVG_MAX_MS).toBe(3_000);
    expect(HARD_GATE_THRESHOLDS.AI_LATENCY_MAX_MS).toBe(5_000);
    expect(HARD_GATE_THRESHOLDS.HTML_PREVIEW_AVG_MAX_MS).toBe(10_000);
    expect(HARD_GATE_THRESHOLDS.HTML_PREVIEW_MAX_MS).toBe(15_000);
    expect(HARD_GATE_THRESHOLDS.ADVISOR_OPTION_RATIO_MIN).toBe(0.90);
    expect(HARD_GATE_THRESHOLDS.TEMPLATE_MATCH_RATE_MIN).toBe(1.00);
    expect(HARD_GATE_THRESHOLDS.VOICE_ACCURACY_MIN).toBe(0.95);
    expect(HARD_GATE_THRESHOLDS.MEMORY_MAX_MB).toBe(8 * 1024);
  });
});
