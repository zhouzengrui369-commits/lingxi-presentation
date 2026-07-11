/**
 * cli:north-star — T-4.1 北极星 10 次 demo 验证 runner
 * 灵犀演示 · Phase 4 · Gate 4
 *
 * 流程：
 *   - 跑 10 次完整 demo，每次 spawn `cli/full-demo.ts` 作为子进程（不重写 e2e 流程）
 *   - 每次跑完记录：success / total_duration / preview_html_latency / advisor_latency
 *     / memory_peak / 4 format sizes / daemon_port / fallback_used
 *   - 失败时重试 1 次（不算入 10 次总数）
 *   - 失败/不达标立即 raise（不静默 skip）
 *   - 全部跑完写 per-run JSON + aggregate JSON
 *
 * 用法：
 *   node --experimental-strip-types apps/desktop/cli/north-star.ts \
 *     --input apps/desktop/testdata/quarterly_review \
 *     --output-base /tmp/north_star \
 *     --record-dir /tmp/north_star_metrics \
 *     --runs 10 \
 *     --fail-fast
 *
 * 必读：README.md 与 PRD §6 (硬指标) + §7 (验收标准)
 */

import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

// ---- 类型 ----

export interface FormatMetric {
  size_bytes: number;
  ok: boolean;
}

export interface RunMetrics {
  run_num: number;
  success: boolean;
  fail_reason?: string;
  retry_attempted: boolean;
  total_duration_ms: number;
  preview_html_latency_ms: number;
  advisor_latency_ms: number;
  memory_peak_mb: number;
  formats: {
    pptx: FormatMetric;
    pdf: FormatMetric;
    docx: FormatMetric;
    html: FormatMetric;
  };
  daemon_port: number;
  fallback_used: boolean;
  started_at: string;
  finished_at: string;
}

export interface AggregateMetrics {
  total_runs: number;
  success_count: number;
  success_rate: number;
  avg_total_duration_ms: number;
  avg_preview_html_latency_ms: number;
  max_preview_html_latency_ms: number;
  avg_advisor_latency_ms: number;
  max_advisor_latency_ms: number;
  max_memory_peak_mb: number;
  format_avg_sizes: Record<string, number>;
  format_min_sizes: Record<string, number>;
  format_ok_rate: Record<string, number>;
  runs: RunMetrics[];
  prd_gates: {
    success_rate_10_of_10: boolean;
    preview_html_avg_under_10s: boolean;
    advisor_avg_under_3s: boolean;
    memory_under_8g: boolean;
  };
  verdict: 'PASS' | 'FAIL';
  generated_at: string;
}

// ---- PRD 阈值（与 goal.md §3 + rules.md §9.1 完全一致） ----

export const PRD_THRESHOLDS = {
  PREVIEW_HTML_AVG_MAX_MS: 10_000,
  ADVISOR_AVG_MAX_MS: 3_000,
  MEMORY_MAX_MB: 8 * 1024,
  SUCCESS_RATE_MIN: 1.0,
} as const;

// ---- Args ----

export function parseArgs(argv: string[]): {
  input: string;
  outputBase: string;
  recordDir: string;
  runs: number;
  failFast: boolean;
  daemonPort?: number;
} {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    }
  }
  return {
    input: out.input || 'apps/desktop/testdata/quarterly_review',
    outputBase: out['output-base'] || '/tmp/north_star',
    recordDir: out['record-dir'] || '/tmp/north_star_metrics',
    runs: parseInt(out.runs || '10', 10),
    failFast: out['fail-fast'] === 'true' || out['fail-fast'] === '1',
    daemonPort: out['daemon-port'] ? parseInt(out['daemon-port'], 10) : undefined,
  };
}

// ---- helpers ----

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/** 用 /v1/chat 探测 advisor 延迟 — 不依赖 full-demo 的 stdout 解析 */
export async function probeAdvisor(
  port: number,
  prompt: string,
): Promise<{ elapsed_ms: number; provider: string; fell_back: boolean }> {
  const started = Date.now();
  const resp = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!resp.ok) {
    throw new Error(`advisor /v1/chat 返回 ${resp.status}: ${await resp.text()}`);
  }
  const data = (await resp.json()) as any;
  return {
    elapsed_ms: Date.now() - started,
    provider: data.provider ?? 'unknown',
    fell_back: Boolean(data.fell_back),
  };
}

/** 进程 RSS 轮询器（子进程跑期间） */
export async function pollPeakRss(pid: number, stopSignal: AbortSignal, intervalMs = 250): Promise<number> {
  let peak = 0;
  while (!stopSignal.aborted) {
    try {
      const r = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)]);
      // r.stdout is a Buffer; convert to string first (Buffer.trim() doesn't exist in Node 24)
      const rssKb = parseInt((r.stdout ?? '').toString().trim(), 10);
      if (Number.isFinite(rssKb) && rssKb > peak) peak = rssKb;
    } catch {
      /* poll may race with process death */
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, intervalMs);
      stopSignal.addEventListener('abort', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  return Math.round(peak / 1024);
}

/** Spawn full-demo.ts subprocess + 监控 RSS */
async function spawnFullDemo(
  runNum: number,
  inputDir: string,
  outputDir: string,
  daemonPort: number,
): Promise<{
  status: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  peakRssMb: number;
}> {
  const desktopDir = path.resolve('apps/desktop');
  const start = Date.now();

  // 把 input/output 转成 absolute path 或相对于 desktopDir 的 path
  // full-demo.ts 假设 cwd=apps/desktop/，会 path.resolve(args.input)
  // 所以传入的相对路径必须相对于 apps/desktop/，或者传绝对路径
  const inputArg = path.isAbsolute(inputDir) ? inputDir : path.relative(desktopDir, path.resolve(inputDir));
  const outputArg = path.isAbsolute(outputDir) ? outputDir : path.relative(desktopDir, path.resolve(outputDir));

  // 提前清理目标 output dir（full-demo 内部也会清 kbRoot，但 output dir 需要我们清）
  await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(outputDir, { recursive: true });

  const env = {
    ...process.env,
    LINGXI_DAEMON_PORT: String(daemonPort),
    LINGXI_RUN_NUM: String(runNum),
  };

  // 用 tsx 跑 .ts（避免再调一次 node strip-types）
  const tsxBin = path.join(desktopDir, 'node_modules/.bin/tsx');
  const child = spawn(
    tsxBin,
    [
      path.join(desktopDir, 'cli/full-demo.ts'),
      '--input', inputArg,
      '--output', outputArg,
    ],
    {
      cwd: desktopDir,  // full-demo.ts 假设 cwd=apps/desktop/
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (d) => { stdout += d.toString('utf-8'); });
  child.stderr?.on('data', (d) => { stderr += d.toString('utf-8'); });

  const stopSignal = new AbortController();
  const peakP = pollPeakRss(child.pid!, stopSignal.signal);

  // 等子进程退出（10s 超时兜底 — full-demo 内部 step4 preview 也有 10s 上限，整体应 < 60s）
  const exitCode: number = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(124);  // timeout sentinel
    }, 120_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      stderr += `\nspawn error: ${err.message}`;
      resolve(125);
    });
  });

  stopSignal.abort();
  const peakRssMb = await peakP;
  const durationMs = Date.now() - start;

  return {
    status: exitCode,
    stdout,
    stderr,
    durationMs,
    peakRssMb,
  };
}

/** 从 full-demo 写出的 demo-summary.json 里挑关键字段 */
async function readDemoSummary(outputDir: string): Promise<{
  ok: boolean;
  preview_html_latency_ms: number;
  formats: RunMetrics['formats'];
  total_ms: number;
}> {
  const summaryPath = path.join(outputDir, 'demo-summary.json');
  if (!(await fileExists(summaryPath))) {
    return { ok: false, preview_html_latency_ms: 0, formats: emptyFormats(), total_ms: 0 };
  }
  let summary: any;
  try {
    summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
  } catch {
    return { ok: false, preview_html_latency_ms: 0, formats: emptyFormats(), total_ms: 0 };
  }

  const pipeline: any[] = summary.pipeline ?? [];
  const previewStep = pipeline.find((p: any) => p.step === 'preview_generate');
  const outputStep = pipeline.find((p: any) => p.step === 'output_4_formats');

  const preview_html_latency_ms = previewStep?.data?.latency_ms ?? 0;

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

  return {
    ok: Boolean(summary.ok),
    preview_html_latency_ms,
    formats,
    total_ms: summary.total_ms ?? 0,
  };
}

export function emptyFormats(): RunMetrics['formats'] {
  return {
    pptx: { size_bytes: 0, ok: false },
    pdf: { size_bytes: 0, ok: false },
    docx: { size_bytes: 0, ok: false },
    html: { size_bytes: 0, ok: false },
  };
}

// ---- 单次 run ----

async function runOnce(
  runNum: number,
  args: ReturnType<typeof parseArgs>,
  daemonPort: number,
): Promise<RunMetrics> {
  const runOutputDir = path.join(args.outputBase, `run_${pad2(runNum)}`);
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  console.log(`\n[run ${pad2(runNum)}/${args.runs}] starting ... output=${runOutputDir}`);

  // (a) advisor latency probe (separate, so we get a clean measurement)
  let advisor: { elapsed_ms: number; provider: string; fell_back: boolean };
  try {
    advisor = await probeAdvisor(daemonPort, 'Q1 2026 灵犀演示 季度汇报的关键要素有哪些？');
  } catch (e) {
    console.error(`  advisor probe failed: ${(e as Error).message}`);
    return {
      run_num: runNum,
      success: false,
      fail_reason: `advisor probe failed: ${(e as Error).message}`,
      retry_attempted: false,
      total_duration_ms: Math.round(performance.now() - t0),
      preview_html_latency_ms: 0,
      advisor_latency_ms: 0,
      memory_peak_mb: 0,
      formats: emptyFormats(),
      daemon_port: daemonPort,
      fallback_used: false,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    };
  }
  console.log(`  advisor: provider=${advisor.provider} elapsed=${advisor.elapsed_ms}ms fell_back=${advisor.fell_back}`);

  // (b) full-demo subprocess
  const child = await spawnFullDemo(runNum, args.input, runOutputDir, daemonPort);
  console.log(`  full-demo: status=${child.status} duration=${child.durationMs}ms peak_rss=${child.peakRssMb}MB`);

  // (c) read summary
  const summary = await readDemoSummary(runOutputDir);
  console.log(`  summary: ok=${summary.ok} preview_latency=${summary.preview_html_latency_ms}ms`);
  for (const [fmt, m] of Object.entries(summary.formats)) {
    console.log(`    .${fmt}: size=${m.size_bytes}B ok=${m.ok}`);
  }

  const allFormatsOk = Object.values(summary.formats).every((f) => f.ok);
  const ok = child.status === 0 && summary.ok && allFormatsOk;

  const finishedAt = new Date().toISOString();
  const totalMs = Math.round(performance.now() - t0);

  if (!ok) {
    let failReason = `child_status=${child.status}`;
    if (!summary.ok) failReason += ` summary.ok=false`;
    if (!allFormatsOk) {
      const badFmts = Object.entries(summary.formats).filter(([, m]) => !m.ok).map(([k]) => k);
      failReason += ` formats_failed=[${badFmts.join(',')}]`;
    }
    if (child.stderr.trim()) failReason += ` stderr_tail="${child.stderr.trim().split('\n').slice(-1)[0]?.slice(0, 200)}"`;
    console.error(`  FAILED: ${failReason}`);
    return {
      run_num: runNum,
      success: false,
      fail_reason: failReason,
      retry_attempted: false,
      total_duration_ms: totalMs,
      preview_html_latency_ms: summary.preview_html_latency_ms,
      advisor_latency_ms: advisor.elapsed_ms,
      memory_peak_mb: child.peakRssMb,
      formats: summary.formats,
      daemon_port: daemonPort,
      fallback_used: advisor.fell_back,
      started_at: startedAt,
      finished_at: finishedAt,
    };
  }

  return {
    run_num: runNum,
    success: true,
    retry_attempted: false,
    total_duration_ms: totalMs,
    preview_html_latency_ms: summary.preview_html_latency_ms,
    advisor_latency_ms: advisor.elapsed_ms,
    memory_peak_mb: child.peakRssMb,
    formats: summary.formats,
    daemon_port: daemonPort,
    fallback_used: advisor.fell_back,
    started_at: startedAt,
    finished_at: finishedAt,
  };
}

// ---- 聚合 ----

export function aggregate(runs: RunMetrics[]): AggregateMetrics {
  const okRuns = runs.filter((r) => r.success);

  const success_count = okRuns.length;
  const success_rate = runs.length === 0 ? 0 : success_count / runs.length;

  const avg = (vs: number[]) => (vs.length === 0 ? 0 : Math.round(vs.reduce((a, b) => a + b, 0) / vs.length));
  const max = (vs: number[]) => (vs.length === 0 ? 0 : Math.max(...vs));

  const previewLatencies = okRuns.map((r) => r.preview_html_latency_ms);
  const advisorLatencies = okRuns.map((r) => r.advisor_latency_ms);
  const memoryPeaks = runs.map((r) => r.memory_peak_mb);  // memory tracked even on fail (process reality)

  const formatAvgSizes: Record<string, number> = {};
  const formatMinSizes: Record<string, number> = {};
  const formatOkRate: Record<string, number> = {};
  for (const fmt of ['pptx', 'pdf', 'docx', 'html']) {
    const sizes = okRuns.map((r) => r.formats[fmt as keyof RunMetrics['formats']].size_bytes);
    const oks = runs.map((r) => r.formats[fmt as keyof RunMetrics['formats']].ok);
    formatAvgSizes[fmt] = avg(sizes);
    formatMinSizes[fmt] = sizes.length === 0 ? 0 : Math.min(...sizes);
    formatOkRate[fmt] = runs.length === 0 ? 0 : oks.filter(Boolean).length / runs.length;
  }

  const prd_gates = {
    success_rate_10_of_10: success_count === runs.length,
    preview_html_avg_under_10s: avg(previewLatencies) <= PRD_THRESHOLDS.PREVIEW_HTML_AVG_MAX_MS,
    advisor_avg_under_3s: avg(advisorLatencies) <= PRD_THRESHOLDS.ADVISOR_AVG_MAX_MS,
    memory_under_8g: max(memoryPeaks) <= PRD_THRESHOLDS.MEMORY_MAX_MB,
  };

  const verdict: 'PASS' | 'FAIL' = (
    prd_gates.success_rate_10_of_10 &&
    prd_gates.preview_html_avg_under_10s &&
    prd_gates.advisor_avg_under_3s &&
    prd_gates.memory_under_8g
  ) ? 'PASS' : 'FAIL';

  return {
    total_runs: runs.length,
    success_count,
    success_rate,
    avg_total_duration_ms: avg(okRuns.map((r) => r.total_duration_ms)),
    avg_preview_html_latency_ms: avg(previewLatencies),
    max_preview_html_latency_ms: max(previewLatencies),
    avg_advisor_latency_ms: avg(advisorLatencies),
    max_advisor_latency_ms: max(advisorLatencies),
    max_memory_peak_mb: max(memoryPeaks),
    format_avg_sizes: formatAvgSizes,
    format_min_sizes: formatMinSizes,
    format_ok_rate: formatOkRate,
    runs,
    prd_gates,
    verdict,
    generated_at: new Date().toISOString(),
  };
}

// ---- Loop (testable: runOnce is dependency-injected) ----

export interface LoopDeps {
  runOnceFn: (runNum: number, args: ParsedArgs, daemonPort: number) => Promise<RunMetrics>;
}

export async function runNorthStarLoop(
  args: ParsedArgs,
  daemonPort: number,
  deps: Partial<LoopDeps> = {},
): Promise<{ runs: RunMetrics[]; failedRetries: Array<{ run_num: number; fail_reason: string }> }> {
  const runOnceFn = deps.runOnceFn ?? runOnce;
  const runs: RunMetrics[] = [];
  const failedRetries: Array<{ run_num: number; fail_reason: string }> = [];

  for (let i = 1; i <= args.runs; i++) {
    const result = await runOnceFn(i, args, daemonPort);

    if (!result.success) {
      // 重试 1 次（不算入 10 次总数）
      console.log(`[run ${pad2(i)}] FAILED, retrying once ...`);
      result.retry_attempted = true;
      const retry = await runOnceFn(i, args, daemonPort);
      retry.retry_attempted = true;
      if (retry.success) {
        retry.fail_reason = `recovered_after_retry: ${result.fail_reason}`;
        runs.push(retry);
        console.log(`[run ${pad2(i)}] RETRY PASSED ✓`);
      } else {
        retry.fail_reason = `retry_also_failed: ${retry.fail_reason}; original: ${result.fail_reason}`;
        runs.push(retry);
        failedRetries.push({ run_num: i, fail_reason: retry.fail_reason });
        console.error(`[run ${pad2(i)}] RETRY ALSO FAILED ✗`);
        if (args.failFast) {
          console.error(`[north-star] fail-fast: stopping at run ${i}`);
          break;
        }
      }
    } else {
      runs.push(result);
    }

    // 每跑完一次立刻落盘（防止中途崩了丢数据）
    const perRunPath = path.join(args.recordDir, `run_${pad2(i)}.json`);
    await fs.writeFile(perRunPath, JSON.stringify(runs[runs.length - 1], null, 2), 'utf-8');
  }

  return { runs, failedRetries };
}

// ---- main ----

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 找 daemon port（如果没有传）
  let daemonPort = args.daemonPort;
  if (!daemonPort) {
    const portFromEnv = process.env.LINGXI_DAEMON_PORT;
    if (portFromEnv) {
      daemonPort = parseInt(portFromEnv, 10);
    } else {
      throw new Error('缺少 daemon port：传 --daemon-port 或设置 LINGXI_DAEMON_PORT');
    }
  }

  // 验证 daemon 可达
  const healthResp = await fetch(`http://127.0.0.1:${daemonPort}/v1/health`);
  if (!healthResp.ok) {
    throw new Error(`daemon /v1/health 返回 ${healthResp.status}`);
  }
  const health = await healthResp.json() as any;
  console.log(`[north-star] daemon port=${daemonPort} status=${health.status} providers=${(health.providers ?? []).join(',')}`);

  await fs.mkdir(args.outputBase, { recursive: true });
  await fs.mkdir(args.recordDir, { recursive: true });

  const { runs, failedRetries } = await runNorthStarLoop(args, daemonPort);

  const agg = aggregate(runs);
  const aggPath = path.join(args.recordDir, 'aggregate.json');
  await fs.writeFile(aggPath, JSON.stringify(agg, null, 2), 'utf-8');

  console.log(`\n========= NORTH-STAR AGGREGATE =========`);
  console.log(`  total_runs: ${agg.total_runs}`);
  console.log(`  success_count: ${agg.success_count}`);
  console.log(`  success_rate: ${(agg.success_rate * 100).toFixed(1)}%`);
  console.log(`  avg_preview_html_latency: ${agg.avg_preview_html_latency_ms}ms (max ${agg.max_preview_html_latency_ms}ms)`);
  console.log(`  avg_advisor_latency: ${agg.avg_advisor_latency_ms}ms (max ${agg.max_advisor_latency_ms}ms)`);
  console.log(`  max_memory_peak: ${agg.max_memory_peak_mb}MB`);
  console.log(`  format_avg_sizes: ${JSON.stringify(agg.format_avg_sizes)}`);
  console.log(`  prd_gates: ${JSON.stringify(agg.prd_gates)}`);
  console.log(`  VERDICT: ${agg.verdict}`);
  console.log(`  aggregate.json: ${aggPath}`);

  if (failedRetries.length > 0) {
    console.error(`[north-star] failed_runs_after_retry: ${JSON.stringify(failedRetries)}`);
    process.exit(2);
  }
  if (agg.verdict === 'FAIL') {
    process.exit(3);
  }
  process.exit(0);
}

// 给测试用：暴露主要 API
export const _internal = {
  parseArgs,
  pollPeakRss,
  spawnFullDemo,
  readDemoSummary,
  runOnce,
  emptyFormats,
};

// 仅当直接执行本文件（而非被 import）时才跑 main()
// 用 process.argv[1] basename 匹配，避免 import.meta 在 jest commonjs 下编译失败
const _invokedDirectly = process.argv[1] && (
  process.argv[1].endsWith('north-star.ts') ||
  process.argv[1].endsWith('north-star.js')
);

if (_invokedDirectly) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(99);
  });
}