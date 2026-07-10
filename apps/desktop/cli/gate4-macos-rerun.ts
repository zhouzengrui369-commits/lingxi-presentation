/**
 * cli:gate4-macos-rerun — T-G4-macos Gate 4 北极星 10 次 demo 重跑 (T-6.8 装后)
 * 灵犀演示 · Phase 6 收尾后 · Gate 4 macOS half
 *
 * 5 硬指标 (goal.md §5 + phase6_plan.md T-6.8 验收信号 line 229-234):
 *   1. success_rate     : 10/10 demo 全部成功 (无 retry_also_failed)
 *   2. preview_latency  : 平均 HTML 预览延迟 ≤ 10s (PRD 硬指标)
 *   3. advisor_latency  : 平均 AI 响应延迟 ≤ 3s (PRD 硬指标)
 *   4. max_memory       : 10 次 max RSS ≤ 8G (8192MB)
 *   5. multi_format     : 4 格式 (pptx/pdf/docx/html) 100% 成功
 *
 * 路径:
 *   - /Applications/灵犀演示.app (T-6.8 装好的真 app)
 *   - cli/real-runtime-validate.ts --real-app (T-6.3 写的 3 模式 validator, 复用 --real-app 模式)
 *   - apps/desktop/testdata/quarterly_review/ (5-7 文件, T-6.2 KB 真持久化后落地)
 *
 * 用法:
 *   tsx apps/desktop/cli/gate4-macos-rerun.ts \
 *     --app-path /Applications/灵犀演示.app \
 *     --rounds 10 \
 *     --testdata apps/desktop/testdata/quarterly_review \
 *     --output /tmp/gate4_macos_rerun
 *
 * 串行跑 10 次, 写:
 *   - gate4_macos_rerun.json      (per-run + aggregate + verdict)
 *   - summary_dashboard.md        (5 硬指标 PASS/FAIL 可视化)
 *   - screenshots/T-G4-macos/     (10 demo + 1 dashboard = 11 张)
 */

import { spawn, spawnSync } from 'node:child_process';
import { promises as fs, existsSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

function getScriptDir(): string {
  // 优先 process.cwd() (假设从 apps/desktop/ 跑)
  // 兜底 global.__dirname (T-6.3 模板)
  // 兜底 process.argv[1] dirname
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (global as any).__dirname;
  if (typeof d === 'string' && d.length > 0 && d !== '/') return d;
  if (process.argv[1]) {
    return path.dirname(path.resolve(process.argv[1]));
  }
  return process.cwd();
}

const desktopDir = (() => {
  // 优先 process.cwd() (假设从 apps/desktop/ 跑)
  const cwd = process.cwd();
  if (cwd.endsWith('/apps/desktop') || cwd.endsWith('/desktop')) {
    return cwd;
  }
  // 兜底: 从 script dir 推
  return path.resolve(getScriptDir(), '..');
})();

// ---- 5 硬指标阈值 (goal.md §5 + phase6_plan.md T-6.8 line 229-234 一致) ----

export const GATE4_THRESHOLDS = {
  SUCCESS_RATE_MIN: 1.0,          // 10/10 必全过
  PREVIEW_HTML_AVG_MAX_MS: 10_000, // ≤ 10s
  ADVISOR_AVG_MAX_MS: 3_000,       // ≤ 3s
  MEMORY_MAX_MB: 8 * 1024,         // ≤ 8G
  MULTI_FORMAT_MIN_OK: 1.0,        // 4 格式 100% 成功
} as const;

// ---- 5 硬指标数据结构 ----

export interface Gate4HardGateResult {
  index: number;
  name: string;
  threshold_desc: string;
  pass: boolean;
  observed: number | string | boolean;
  unit: string;
  detail?: string;
}

export interface RunMetrics {
  run_num: number;
  started_at: string;
  finished_at: string;
  total_duration_ms: number;
  app_pid: number;
  app_path: string;
  daemon_port: number;

  // 5 硬指标原始值
  success: boolean;
  preview_html_latency_ms: number;
  advisor_latency_ms: number;
  memory_peak_mb: number;
  formats: {
    pptx: { size_bytes: number; ok: boolean };
    pdf: { size_bytes: number; ok: boolean };
    docx: { size_bytes: number; ok: boolean };
    html: { size_bytes: number; ok: boolean };
  };
  format_ok_rate: number;          // 0-1, 4 格式中成功比例

  // 5 gate 评估
  gates: Gate4HardGateResult[];
  overall_pass: boolean;
  fail_reason?: string;
}

export interface AggregateMetrics {
  plan_id: string;                 // T-G4-macos
  app_path: string;
  testdata_dir: string;
  total_runs: number;
  success_count: number;
  generated_at: string;

  // 5 硬指标聚合
  success_rate: number;            // 0-1
  avg_preview_html_latency_ms: number;
  max_preview_html_latency_ms: number;
  avg_advisor_latency_ms: number;
  max_advisor_latency_ms: number;
  max_memory_peak_mb: number;
  avg_format_ok_rate: number;

  // 4 格式 size 统计
  format_avg_sizes: Record<string, number>;
  format_ok_rates: Record<string, number>;

  // 5 gate 评估
  gates: Gate4HardGateResult[];
  overall_verdict: 'PASS' | 'FAIL';
  runs: RunMetrics[];
}

// ---- Args ----

export interface CliArgs {
  appPath: string;
  rounds: number;
  testdataDir: string;
  outputBase: string;
  recordDir: string;
  screenshotDir: string;
  failFast: boolean;
  daemonPort?: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    }
  }
  return {
    appPath: out['app-path'] || '/Applications/灵犀演示.app',
    rounds: parseInt(out.rounds || '10', 10),
    testdataDir: out.testdata || path.join(desktopDir, 'testdata', 'quarterly_review'),
    outputBase: out.output || '/tmp/gate4_macos_rerun',
    recordDir: out['record-dir'] || '/tmp/gate4_macos_metrics',
    screenshotDir: out['screenshot-dir'] || path.join(desktopDir, 'screenshots', 'T-G4-macos'),
    failFast: out['fail-fast'] === 'true' || out['fail-fast'] === '1',
    daemonPort: out['daemon-port'] ? parseInt(out['daemon-port'], 10) : undefined,
  };
}

// ---- 5 指标 gate 评估 (纯函数, 便于 unit test) ----

export function evaluateSuccessRateGate(successRate: number): Gate4HardGateResult {
  const pass = successRate >= GATE4_THRESHOLDS.SUCCESS_RATE_MIN;
  return {
    index: 1,
    name: '10/10 成功',
    threshold_desc: '10/10 demo 全部成功 (无 retry_also_failed)',
    pass,
    observed: successRate,
    unit: 'ratio',
    detail: `${(successRate * 100).toFixed(1)}% (${(successRate * 10).toFixed(0)}/10)`,
  };
}

export function evaluatePreviewLatencyGate(avgMs: number, maxMs: number): Gate4HardGateResult {
  const pass = avgMs <= GATE4_THRESHOLDS.PREVIEW_HTML_AVG_MAX_MS;
  return {
    index: 2,
    name: 'HTML 预览延迟',
    threshold_desc: 'avg ≤ 10s',
    pass,
    observed: avgMs,
    unit: 'ms',
    detail: `avg=${avgMs}ms, max=${maxMs}ms`,
  };
}

export function evaluateAdvisorLatencyGate(avgMs: number, maxMs: number): Gate4HardGateResult {
  const pass = avgMs <= GATE4_THRESHOLDS.ADVISOR_AVG_MAX_MS;
  return {
    index: 3,
    name: 'AI 响应延迟',
    threshold_desc: 'avg ≤ 3s',
    pass,
    observed: avgMs,
    unit: 'ms',
    detail: `avg=${avgMs}ms, max=${maxMs}ms`,
  };
}

export function evaluateMemoryGate(maxMemoryMb: number): Gate4HardGateResult {
  const pass = maxMemoryMb <= GATE4_THRESHOLDS.MEMORY_MAX_MB;
  return {
    index: 4,
    name: '资源占用',
    threshold_desc: 'max RSS ≤ 8G',
    pass,
    observed: maxMemoryMb,
    unit: 'MB',
    detail: `max=${maxMemoryMb}MB`,
  };
}

export function evaluateMultiFormatGate(okRate: number): Gate4HardGateResult {
  const pass = okRate >= GATE4_THRESHOLDS.MULTI_FORMAT_MIN_OK;
  return {
    index: 5,
    name: '4 格式输出',
    threshold_desc: 'pptx/pdf/docx/html 100% 成功',
    pass,
    observed: okRate,
    unit: 'ratio',
    detail: `${(okRate * 100).toFixed(1)}% 格式成功`,
  };
}

export function evaluateRunGates(m: RunMetrics): Gate4HardGateResult[] {
  // 单 run: success_rate = 1.0 if success else 0.0
  const runSuccessRate = m.success ? 1.0 : 0.0;
  // 单 run format_ok_rate
  const runFormatOkRate = m.format_ok_rate;
  return [
    evaluateSuccessRateGate(runSuccessRate),
    evaluatePreviewLatencyGate(m.preview_html_latency_ms, m.preview_html_latency_ms),
    evaluateAdvisorLatencyGate(m.advisor_latency_ms, m.advisor_latency_ms),
    evaluateMemoryGate(m.memory_peak_mb),
    evaluateMultiFormatGate(runFormatOkRate),
  ];
}

export function evaluateAggregateGates(agg: AggregateMetrics): Gate4HardGateResult[] {
  return [
    evaluateSuccessRateGate(agg.success_rate),
    evaluatePreviewLatencyGate(agg.avg_preview_html_latency_ms, agg.max_preview_html_latency_ms),
    evaluateAdvisorLatencyGate(agg.avg_advisor_latency_ms, agg.max_advisor_latency_ms),
    evaluateMemoryGate(agg.max_memory_peak_mb),
    evaluateMultiFormatGate(agg.avg_format_ok_rate),
  ];
}

export function overallVerdict(gates: Gate4HardGateResult[]): 'PASS' | 'FAIL' {
  return gates.every((g) => g.pass) ? 'PASS' : 'FAIL';
}

// ---- helpers ----

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function emptyFormats(): RunMetrics['formats'] {
  return {
    pptx: { size_bytes: 0, ok: false },
    pdf: { size_bytes: 0, ok: false },
    docx: { size_bytes: 0, ok: false },
    html: { size_bytes: 0, ok: false },
  };
}

async function pollPeakRss(pid: number, stopSignal: AbortSignal, intervalMs = 250): Promise<number> {
  let peak = 0;
  while (!stopSignal.aborted) {
    try {
      const r = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)]);
      const rssKb = parseInt((r.stdout ?? '').toString().trim(), 10);
      if (Number.isFinite(rssKb) && rssKb > peak) peak = rssKb;
    } catch { /* poll may race with process death */ }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, intervalMs);
      stopSignal.addEventListener('abort', () => { clearTimeout(t); resolve(); });
    });
  }
  return Math.round(peak / 1024);
}

function getPidsByName(name: string): number[] {
  try {
    const r = spawnSync('pgrep', ['-f', name]);
    const out = (r.stdout ?? '').toString().trim();
    if (!out) return [];
    return out.split('\n').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
  } catch {
    return [];
  }
}

// ---- 单次 run (T-6.3 real-runtime-validate.ts --real-app 复用) ----

/**
 * 调用 T-6.3 real-runtime-validate.ts --real-app 模式跑一次
 * 等待 tsx 子进程退出 + 读 demo-summary.json 解析 5 硬指标
 */
async function runOnce(
  runNum: number,
  args: CliArgs,
): Promise<RunMetrics> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const runOutputDir = path.join(args.outputBase, `run_${pad2(runNum)}`);

  if (!existsSync(args.appPath)) {
    throw new Error(`/Applications/灵犀演示.app not found: ${args.appPath} (T-6.8 must be installed first)`);
  }
  if (!existsSync(args.testdataDir)) {
    throw new Error(`testdata not found: ${args.testdataDir}`);
  }

  // 复用 T-6.3 real-runtime-validate.ts --real-app 模式
  // T-6.8 已证明这条路可走 (--lingxi-validate-run=1 启动 app, app 内部跑 demo)
  const tsxBin = path.join(desktopDir, 'node_modules', '.bin', 'tsx');
  const validator = path.join(desktopDir, 'cli', 'real-runtime-validate.ts');
  const child = spawn(
    tsxBin,
    [
      validator,
      '--real-app',
      '--app-path', args.appPath,
      '--input', args.testdataDir,
      '--output-base', runOutputDir,
      '--record-dir', path.join(runOutputDir, 'metrics'),
      '--screenshot-dir', path.join(runOutputDir, 'screenshots'),
      '--runs', '1',  // 每次只跑 1 次 (gate4-macos-rerun.ts 自己的 loop 控制 10 次)
    ],
    {
      cwd: desktopDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (d) => { stdout += d.toString(); });
  child.stderr?.on('data', (d) => { stderr += d.toString(); });

  // 监控 app 进程 RSS — 找 main app PID
  // real-runtime-validate.ts --real-app 会 spawn /Applications/灵犀演示.app
  // 我们用 pgrep 找灵犀演示 main process (排除 helper)
  const stopSignal = new AbortController();
  let peakP: Promise<number>;
  let appPid = 0;
  let daemonPort = 0;

  // 等待 app 起来 (sleep 2s 留 spawn 时间)
  await new Promise((r) => setTimeout(r, 2000));
  const appPids = getPidsByName('/Applications/灵犀演示.app/Contents/MacOS/灵犀演示');
  if (appPids.length > 0) {
    appPid = appPids[0]!;
    peakP = pollPeakRss(appPid, stopSignal.signal);
  } else {
    peakP = Promise.resolve(0);
  }

  // 等子进程退出 (60s 单 run 上限 — T-6.8 实测 ~10s/run)
  const exitCode: number = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      // 也 kill app process
      const pids = getPidsByName('/Applications/灵犀演示.app/Contents/MacOS/灵犀演示');
      pids.forEach((p) => {
        try { spawnSync('kill', ['-9', String(p)]); } catch { /* ignore */ }
      });
      resolve(124);
    }, 90_000);
    child.on('exit', (code) => { clearTimeout(timer); resolve(code ?? -1); });
    child.on('error', (err) => { clearTimeout(timer); stderr += `\nspawn error: ${err.message}`; resolve(125); });
  });

  stopSignal.abort();
  const peakRssMb = await peakP;

  // 读 demo-summary.json (T-6.8 模板: args.outputBase/run_NN/run_01/demo-summary.json)
  // real-runtime-validate.ts T-6.8 runRealAppOnce 用 runOutputDir (args.outputBase/run_NN/) 作为
  // 内部 spawn full-demo.ts 的 --output 参数, 而 full-demo.ts 写 demo-summary.json 到 output/run_01/
  const summaryPath = path.join(runOutputDir, 'run_01', 'demo-summary.json');
  let summary: any = null;
  if (existsSync(summaryPath)) {
    try {
      summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
    } catch { /* ignore */ }
  }

  // 解析 5 硬指标
  const pipeline: any[] = summary?.pipeline ?? [];
  const previewStep = pipeline.find((p: any) => p.step === 'preview_generate');
  const advisorStep = pipeline.find((p: any) => p.step === 'advisor_3_rounds');
  const importStep = pipeline.find((p: any) => p.step === 'file_kb_import');
  const outputStep = pipeline.find((p: any) => p.step === 'output_4_formats');

  const previewHtmlLatency = previewStep?.data?.latency_ms ?? 0;
  // advisor 延迟: T-6.3 模板里可能有 daemon_chat_elapsed_ms; 兜底用 step ms
  const advisorLatency = advisorStep?.data?.daemon_chat_elapsed_ms ?? advisorStep?.ms ?? 0;
  daemonPort = summary?.daemon?.port ?? 0;

  const formats = emptyFormats();
  if (outputStep?.data) {
    for (const fmt of ['pptx', 'pdf', 'docx', 'html'] as const) {
      const f = outputStep.data[fmt];
      formats[fmt] = {
        size_bytes: f?.size_bytes ?? 0,
        ok: f?.status === 'ok' && (f?.size_bytes ?? 0) > 0,
      };
    }
  }
  const formatOkCount = Object.values(formats).filter((f) => f.ok).length;
  const formatOkRate = formatOkCount / 4;

  const summaryOk = summary?.ok === true;
  const importOk = importStep?.data?.failed === 0;
  const ok = exitCode === 0 && summaryOk && importOk && formatOkCount === 4;

  const totalMs = Math.round(performance.now() - t0);
  const finishedAt = new Date().toISOString();

  const m: RunMetrics = {
    run_num: runNum,
    started_at: startedAt,
    finished_at: finishedAt,
    total_duration_ms: totalMs,
    app_pid: appPid,
    app_path: args.appPath,
    daemon_port: daemonPort,
    success: ok,
    preview_html_latency_ms: previewHtmlLatency,
    advisor_latency_ms: advisorLatency,
    memory_peak_mb: peakRssMb,
    formats,
    format_ok_rate: formatOkRate,
    gates: [],
    overall_pass: false,
  };
  if (!ok) {
    const reasons: string[] = [];
    if (exitCode !== 0) reasons.push(`exit=${exitCode}`);
    if (!summaryOk) reasons.push('summary.ok=false');
    if (!importOk) reasons.push(`import_failed=${importStep?.data?.failed}`);
    if (formatOkCount < 4) {
      const bad = Object.entries(formats).filter(([, f]) => !f.ok).map(([k]) => k).join(',');
      reasons.push(`formats_failed=[${bad}]`);
    }
    if (stderr.trim()) reasons.push(`stderr_tail=${stderr.trim().split('\n').slice(-1)[0]?.slice(0, 200)}`);
    m.fail_reason = reasons.join('; ');
  }
  m.gates = evaluateRunGates(m);
  m.overall_pass = overallVerdict(m.gates) === 'PASS';
  return m;
}

// ---- 聚合 ----

export function aggregate(runs: RunMetrics[]): AggregateMetrics {
  const okRuns = runs.filter((r) => r.success);
  const avgInt = (vs: number[]) => vs.length === 0 ? 0 : Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
  const max = (vs: number[]) => vs.length === 0 ? 0 : Math.max(...vs);

  const successRate = runs.length === 0 ? 0 : okRuns.length / runs.length;
  const previewLatencies = okRuns.map((r) => r.preview_html_latency_ms);
  const advisorLatencies = okRuns.map((r) => r.advisor_latency_ms);
  const memories = runs.map((r) => r.memory_peak_mb);  // 包含 fail (process reality)
  const formatOkRates = runs.map((r) => r.format_ok_rate);

  const formatAvgSizes: Record<string, number> = {};
  const formatOkRatesByFmt: Record<string, number> = {};
  for (const fmt of ['pptx', 'pdf', 'docx', 'html']) {
    const sizes = okRuns.map((r) => r.formats[fmt as keyof RunMetrics['formats']].size_bytes);
    const oks = runs.map((r) => r.formats[fmt as keyof RunMetrics['formats']].ok);
    formatAvgSizes[fmt] = avgInt(sizes);
    formatOkRatesByFmt[fmt] = runs.length === 0 ? 0 : oks.filter(Boolean).length / runs.length;
  }

  // app_path / testdata_dir: 从 run[0] 拿
  const firstRun = runs[0];

  const agg: AggregateMetrics = {
    plan_id: 'T-G4-macos',
    app_path: firstRun?.app_path ?? '/Applications/灵犀演示.app',
    testdata_dir: '',
    total_runs: runs.length,
    success_count: okRuns.length,
    generated_at: new Date().toISOString(),
    success_rate: successRate,
    avg_preview_html_latency_ms: avgInt(previewLatencies),
    max_preview_html_latency_ms: max(previewLatencies),
    avg_advisor_latency_ms: avgInt(advisorLatencies),
    max_advisor_latency_ms: max(advisorLatencies),
    max_memory_peak_mb: max(memories),
    avg_format_ok_rate: avgInt(formatOkRates.map((r) => r * 100)) / 100,  // 保留 2 位小数
    format_avg_sizes: formatAvgSizes,
    format_ok_rates: formatOkRatesByFmt,
    gates: [],
    overall_verdict: 'FAIL',
    runs,
  };
  agg.gates = evaluateAggregateGates(agg);
  agg.overall_verdict = overallVerdict(agg.gates);
  return agg;
}

// ---- 串行 Loop ----

export interface LoopDeps {
  runOnceFn: (runNum: number) => Promise<RunMetrics>;
}

export async function runGate4Loop(
  args: CliArgs,
  deps: Partial<LoopDeps> = {},
): Promise<RunMetrics[]> {
  const runOnceFn = deps.runOnceFn ?? ((n: number) => runOnce(n, args));
  const runs: RunMetrics[] = [];
  for (let i = 1; i <= args.rounds; i++) {
    console.log(`\n[run ${pad2(i)}/${args.rounds}] starting ...`);
    let r: RunMetrics;
    try {
      r = await runOnceFn(i);
    } catch (e) {
      console.error(`  FATAL: ${(e as Error).message}`);
      r = {
        run_num: i,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        total_duration_ms: 0,
        app_pid: 0,
        app_path: args.appPath,
        daemon_port: 0,
        success: false,
        preview_html_latency_ms: 0,
        advisor_latency_ms: 0,
        memory_peak_mb: 0,
        formats: emptyFormats(),
        format_ok_rate: 0,
        gates: [],
        overall_pass: false,
        fail_reason: `exception: ${(e as Error).message}`,
      };
      r.gates = evaluateRunGates(r);
    }
    runs.push(r);
    console.log(`  success=${r.success} preview=${r.preview_html_latency_ms}ms advisor=${r.advisor_latency_ms}ms mem=${r.memory_peak_mb}MB formats_ok=${(r.format_ok_rate * 100).toFixed(0)}%`);
    if (!r.success && r.fail_reason) {
      console.error(`  fail_reason: ${r.fail_reason}`);
    }
    if (!r.overall_pass && args.failFast) {
      console.error(`[run ${pad2(i)}] gate FAIL, fail-fast: stopping`);
      break;
    }
  }
  return runs;
}

// ---- Markdown dashboard ----

export function renderSummaryDashboard(agg: AggregateMetrics, screenshotDir: string): string {
  const gateMd = agg.gates.map((g) => {
    const mark = g.pass ? '✓' : '✗';
    const observed = typeof g.observed === 'number' ? g.observed.toFixed(2) : String(g.observed);
    return `| ${g.index} | ${mark} | ${g.name} | ${g.threshold_desc} | ${observed} ${g.unit} | ${g.detail ?? ''} |`;
  }).join('\n');

  const runsMd = agg.runs.map((r) => {
    const mark = r.success ? '✓' : '✗';
    return `| ${pad2(r.run_num)} | ${mark} | ${r.preview_html_latency_ms}ms | ${r.advisor_latency_ms}ms | ${r.memory_peak_mb}MB | ${(r.format_ok_rate * 100).toFixed(0)}% | ${r.formats.pptx.size_bytes}B | ${r.formats.pdf.size_bytes}B | ${r.formats.docx.size_bytes}B | ${r.formats.html.size_bytes}B |`;
  }).join('\n');

  return `# 灵犀演示 — T-G4-macos Gate 4 北极星 10 次 demo 重跑验证报告

> Plan-Id: **T-G4-macos** (Phase 6 收尾后 Gate 4 macOS half, T-6.8 装包后)
> 平台: **macOS half** (Win half = T-G4-win 并行 plan)
> App 路径: \`${agg.app_path}\` (T-6.8 装的真 app)
> 生成时间: ${agg.generated_at}
> 跑批次数: **${agg.total_runs}** · 通过: **${agg.success_count}** · 成功率: **${(agg.success_rate * 100).toFixed(1)}%**
> **VERDICT: ${agg.overall_verdict}**

---

## 1. 5 硬指标 gate 评估 (goal.md §5 + phase6_plan.md T-6.8 line 229-234)

| # | 状态 | 指标 | 阈值 | 观察 | 详情 |
|---|---|---|---|---|---|
${gateMd}

## 2. 10 次 run 详细数据

| run | pass | preview_html | advisor | memory | formats | pptx | pdf | docx | html |
|---|---|---|---|---|---|---|---|---|---|
${runsMd}

## 3. 聚合指标

| 指标 | 数值 | 阈值 | 状态 |
|---|---|---|---|
| 10/10 成功 | ${(agg.success_rate * 100).toFixed(1)}% (${agg.success_count}/${agg.total_runs}) | 100% | ${agg.gates[0]!.pass ? '✓' : '✗'} |
| HTML 预览延迟 (avg / max) | ${agg.avg_preview_html_latency_ms}ms / ${agg.max_preview_html_latency_ms}ms | avg ≤ 10000ms | ${agg.gates[1]!.pass ? '✓' : '✗'} |
| AI 响应延迟 (avg / max) | ${agg.avg_advisor_latency_ms}ms / ${agg.max_advisor_latency_ms}ms | avg ≤ 3000ms | ${agg.gates[2]!.pass ? '✓' : '✗'} |
| 资源占用 (max RSS) | ${agg.max_memory_peak_mb}MB | ≤ 8192MB | ${agg.gates[3]!.pass ? '✓' : '✗'} |
| 4 格式输出 (avg ok rate) | ${(agg.avg_format_ok_rate * 100).toFixed(1)}% | 100% | ${agg.gates[4]!.pass ? '✓' : '✗'} |

## 4. 4 格式输出 size 汇总

| 格式 | 平均 size | 最小 size | 成功率 |
|---|---|---|---|
| .pptx | ${agg.format_avg_sizes.pptx ?? 0}B | ${Math.min(...agg.runs.map((r) => r.formats.pptx.size_bytes))}B | ${(agg.format_ok_rates.pptx ?? 0) * 100}% |
| .pdf | ${agg.format_avg_sizes.pdf ?? 0}B | ${Math.min(...agg.runs.map((r) => r.formats.pdf.size_bytes))}B | ${(agg.format_ok_rates.pdf ?? 0) * 100}% |
| .docx | ${agg.format_avg_sizes.docx ?? 0}B | ${Math.min(...agg.runs.map((r) => r.formats.docx.size_bytes))}B | ${(agg.format_ok_rates.docx ?? 0) * 100}% |
| .html | ${agg.format_avg_sizes.html ?? 0}B | ${Math.min(...agg.runs.map((r) => r.formats.html.size_bytes))}B | ${(agg.format_ok_rates.html ?? 0) * 100}% |

## 5. 截图清单 (${screenshotDir}/)

- 10 张 per-run 截图 (run_01.png ... run_10.png)
- 1 张 summary_dashboard.png
- 1 张 pgrep 进程检查截图 (T-6.8 装 4 PID 不受影响)

## 6. 验收信号 (goal.md §5 北极星 + phase6_plan.md T-6.8 line 229-234)

${agg.gates.map((g) => `- [${g.pass ? '✓' : '✗'}] ${g.index}. ${g.name} (${g.threshold_desc})`).join('\n')}

## 7. Changelog

- 2026-07-11: T-G4-macos Gate 4 macOS 北极星 10 次 demo 重跑实现 (T-6.8 装包后)
- 钉子 #1: 复用 T-6.3 real-runtime-validate.ts --real-app 模式
- 钉子 #4: max_concurrency=1, 串行跑 10 次
- 钉子 #14: 3件齐 (commit + deliverable + board) wrap-up
- 钉子 #22: worktree 内 fresh npm install
- 钉子 #30: 30min cap wrap-up
- 钉子 #38: deliverable → board → report-back 三件齐同一 turn 内 close

---

## VERDICT: ${agg.overall_verdict}
`;
}

// ---- main ----

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`\n========= T-G4-macos Gate 4 北极星 10 次 demo 重跑 =========`);
  console.log(`  app-path:     ${args.appPath}`);
  console.log(`  rounds:       ${args.rounds}`);
  console.log(`  testdata:     ${args.testdataDir}`);
  console.log(`  outputBase:   ${args.outputBase}`);
  console.log(`  recordDir:    ${args.recordDir}`);
  console.log(`  screenshot:   ${args.screenshotDir}`);
  console.log(`  failFast:     ${args.failFast}`);

  if (!existsSync(args.appPath)) {
    console.error(`FATAL: ${args.appPath} not found. T-6.8 must be installed first.`);
    process.exit(99);
  }
  if (!existsSync(args.testdataDir)) {
    console.error(`FATAL: testdata dir not found: ${args.testdataDir}`);
    process.exit(99);
  }

  await fs.mkdir(args.outputBase, { recursive: true });
  await fs.mkdir(args.recordDir, { recursive: true });
  await fs.mkdir(args.screenshotDir, { recursive: true });

  const runs = await runGate4Loop(args);

  // 写 per-run JSON
  for (const r of runs) {
    await fs.writeFile(
      path.join(args.recordDir, `run_${pad2(r.run_num)}.json`),
      JSON.stringify(r, null, 2),
      'utf-8',
    );
  }

  // 聚合
  const agg = aggregate(runs);
  // 注入 testdata_dir (run 拿不到)
  agg.testdata_dir = args.testdataDir;
  const aggPath = path.join(args.recordDir, 'aggregate.json');
  await fs.writeFile(aggPath, JSON.stringify(agg, null, 2), 'utf-8');

  // 写 summary dashboard
  const md = renderSummaryDashboard(agg, args.screenshotDir);
  const mdPath = path.join(args.outputBase, 'summary_dashboard.md');
  await fs.writeFile(mdPath, md, 'utf-8');

  // 顶层 gate4_macos_rerun.json (给 verifier grep)
  const top = {
    plan_id: 'T-G4-macos',
    app_path: agg.app_path,
    testdata_dir: agg.testdata_dir,
    generated_at: agg.generated_at,
    overall_verdict: agg.overall_verdict,
    success_count: agg.success_count,
    total_runs: agg.total_runs,
    five_gates: agg.gates,
    aggregate: {
      success_rate: agg.success_rate,
      avg_preview_html_latency_ms: agg.avg_preview_html_latency_ms,
      max_preview_html_latency_ms: agg.max_preview_html_latency_ms,
      avg_advisor_latency_ms: agg.avg_advisor_latency_ms,
      max_advisor_latency_ms: agg.max_advisor_latency_ms,
      max_memory_peak_mb: agg.max_memory_peak_mb,
      avg_format_ok_rate: agg.avg_format_ok_rate,
      format_avg_sizes: agg.format_avg_sizes,
      format_ok_rates: agg.format_ok_rates,
    },
  };
  const topPath = path.join(args.outputBase, 'gate4_macos_rerun.json');
  await fs.writeFile(topPath, JSON.stringify(top, null, 2), 'utf-8');

  console.log(`\n========= T-G4-macos AGGREGATE =========`);
  console.log(`  total_runs:           ${agg.total_runs}`);
  console.log(`  success_count:        ${agg.success_count}`);
  console.log(`  success_rate:         ${(agg.success_rate * 100).toFixed(1)}%`);
  console.log(`  preview (avg/max):    ${agg.avg_preview_html_latency_ms}ms / ${agg.max_preview_html_latency_ms}ms`);
  console.log(`  advisor (avg/max):    ${agg.avg_advisor_latency_ms}ms / ${agg.max_advisor_latency_ms}ms`);
  console.log(`  max_memory_peak:      ${agg.max_memory_peak_mb}MB`);
  console.log(`  avg_format_ok_rate:   ${(agg.avg_format_ok_rate * 100).toFixed(1)}%`);
  console.log(`  gate4_macos_rerun:    ${topPath}`);
  console.log(`  summary_dashboard:    ${mdPath}`);
  console.log(`  aggregate.json:       ${aggPath}`);
  console.log(`  VERDICT:              ${agg.overall_verdict}`);

  if (agg.overall_verdict === 'FAIL') {
    console.error(`[T-G4-macos] VERDICT: FAIL — 5 硬指标任一未达标, 详见 summary_dashboard.md`);
    process.exit(2);
  }
  console.log(`[T-G4-macos] VERDICT: PASS — 5 硬指标全部达标 ✓`);
  process.exit(0);
}

const _invokedDirectly = process.argv[1] && (
  process.argv[1].endsWith('gate4-macos-rerun.ts') ||
  process.argv[1].endsWith('gate4-macos-rerun.js')
);
if (_invokedDirectly) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(99);
  });
}
