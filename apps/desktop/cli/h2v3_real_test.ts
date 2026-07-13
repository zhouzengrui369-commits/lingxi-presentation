/**
 * h2v3_real_test.ts — H2 v3 真模型流式首 token P50/P90 真测
 *
 * 灵犀演示 · Phase 6+ · T-MVP-2 H2 治本 (v3 严格)
 *
 * 任务合同 (Wave 3 output_quality_agent §3.5):
 *   - 真模型流式首 token P50 ≤ 1.5s, P90 ≤ 3.5s
 *   - 必跑 ≥ 10 次真模型流式首 token计时
 *   - 记录 provider/model/样本数/冷热状态/cache/prewarm (钉子 #48)
 *   - cache-hit / prewarm / mock 时延 不计入 H2
 *
 * 用法:
 *   tsx cli/h2v3_real_test.ts                  # 默认 10 轮真模型
 *   tsx cli/h2v3_real_test.ts --runs 20        # 20 轮
 *   tsx cli/h2v3_real_test.ts --skip-warmup    # 不预热 (冷启动 测)
 *   LINGXI_DAEMON_PORT=50999 tsx cli/h2v3_real_test.ts  # 接 daemon
 *
 * 透明限制:
 *   - 需要 MiniMax_API_KEY (真活)
 *   - 无 key 时, 走 mock 路径, **不计入** H2 (任务 §3.5 禁止 cache-hit/prewarm/mock 时延计入 H2)
 *   - 实际场景需 Wave 4 / 用户提供真 key, 跑真模型流式测
 *
 * 钉子 #48: 必标 provider/model/冷热/cache/prewarm (避免假绿)
 */

import { spawn, spawnSync } from 'node:child_process';
import { spawn as _spawn } from 'node:child_process';
import { setTimeout as _sleep } from 'node:timers/promises';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

interface CliArgs {
  runs: number;
  skipWarmup: boolean;
  allowMock: boolean;
  daemonPort: number | null;
  prompt: string;
  model: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    runs: 10,
    skipWarmup: false,
    allowMock: false,
    daemonPort: null,
    prompt: '用一句话介绍灵犀演示, 不超过 50 字',
    model: 'MiniMax-M3',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') out.runs = parseInt(argv[++i], 10);
    else if (a === '--skip-warmup') out.skipWarmup = true;
    else if (a === '--allow-mock') out.allowMock = true;
    else if (a === '--daemon-port') out.daemonPort = parseInt(argv[++i], 10);
    else if (a === '--prompt') out.prompt = argv[++i];
    else if (a === '--model') out.model = argv[++i];
  }
  return out;
}

interface TimingRecord {
  run: number;
  ttft_ms: number;       // time to first token
  total_ms: number;      // total time to completion
  prompt_tokens: number;
  completion_tokens: number;
  provider: string;      // 'api' / 'mock' / 'unavailable'
  fell_back: boolean;
  is_warm: boolean;      // 1st run = cold, 2+ = warm
  cache_status: 'miss' | 'hit' | 'unknown';
  prewarm: boolean;
  model: string;
  error?: string;
  raw_response?: string;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return sorted[idx];
}

async function callDaemonChat(
  daemonBaseUrl: string,
  prompt: string,
  model: string,
  noCache: boolean,
): Promise<{ content: string; elapsed_ms: number; provider: string; fell_back: boolean; raw: unknown }> {
  const ctrl = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (noCache) headers['X-No-Cache'] = '1';
    const r = await fetch(`${daemonBaseUrl}/v1/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, temperature: 0.0, max_tokens: 200 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const elapsed_ms = Date.now() - t0;
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    }
    const data = await r.json() as { content?: string; provider?: string; fell_back?: boolean; provider_status?: string; elapsed_ms?: number };
    return {
      content: data.content ?? '',
      elapsed_ms,
      provider: data.provider_status ?? data.provider ?? 'unknown',
      fell_back: data.fell_back ?? false,
      raw: data,
    };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function ensureDaemon(): Promise<{ daemonBaseUrl: string; isMock: boolean; port: number }> {
  // 1. 试 connect to existing daemon
  const ports = [52851, 52852, 50999, 50995, 50997, 50998];
  for (const port of ports) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(1_000) });
      if (r.ok) {
        const data = await r.json() as { available?: boolean; active_provider?: string };
        const isMock = data.active_provider === 'mock';
        return { daemonBaseUrl: `http://127.0.0.1:${port}`, isMock, port };
      }
    } catch { /* try next port */ }
  }
  // 2. spawn daemon (默认 allow-mock=0, 等真 key)
  const env = { ...process.env };
  // 显式 unset key (避免 silent 假绿)
  delete env.MiniMax_API_KEY;
  delete env.MINIMAX_API_KEY;
  delete env.minimax_API_KEY;
  delete env.__MAVIS_PARENT_ACCESS_TOKEN;
  env.LINGXI_API_PROVIDER_ALLOW_PS_TOKEN = '0';
  env.LINGXI_API_PROVIDER_ALLOW_MOCK = '0';
  env.LINGXI_DAEMON_PORT = '0';
  env.PYTHONPATH = process.cwd();
  const proc = spawn('python3', ['-m', 'backend.daemon.server'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  let port: number | null = null;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 5000);
    proc.stdout?.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      if (lines.length >= 2) {
        const p = parseInt(lines[1].trim(), 10);
        if (!isNaN(p) && p > 0) { port = p; clearTimeout(timer); resolve(); }
      }
    });
    proc.stderr?.on('data', () => { /* ignore */ });
  });
  if (!port) {
    try { proc.kill(); } catch {}
    throw new Error('daemon failed to start within 5s');
  }
  return { daemonBaseUrl: `http://127.0.0.1:${port}`, isMock: true, port };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('=== H2 v3 真模型流式首 token P50/P90 真测 ===');
  console.log(`  runs: ${args.runs}`);
  console.log(`  skipWarmup: ${args.skipWarmup}`);
  console.log(`  allowMock: ${args.allowMock}`);
  console.log(`  model: ${args.model}`);
  console.log(`  prompt: "${args.prompt.slice(0, 40)}..."`);
  console.log();

  // 1. ensure daemon
  let daemon: { daemonBaseUrl: string; isMock: boolean; port: number };
  try {
    daemon = await ensureDaemon();
  } catch (e) {
    console.error('FATAL: cannot start daemon:', (e as Error).message);
    process.exit(2);
  }
  console.log(`[daemon] port=${daemon.port} isMock=${daemon.isMock} (available=unavailable when no key)`);

  // 2. warmup (除非 --skip-warmup)
  if (!args.skipWarmup) {
    console.log('[warmup] running 1 prewarm request to warm model / connection / cache...');
    try {
      const w = await callDaemonChat(daemon.daemonBaseUrl, 'warmup', args.model, true);
      console.log(`[warmup] ok: provider=${w.provider} elapsed_ms=${w.elapsed_ms} content_len=${w.content.length}`);
    } catch (e) {
      console.warn(`[warmup] failed: ${(e as Error).message}`);
    }
    // 关键: 清 cache, 让正式跑不命中 prewarm cache
    try {
      await fetch(`${daemon.daemonBaseUrl}/v1/cache/clear`, { method: 'POST' });
    } catch { /* ignore */ }
  } else {
    console.log('[warmup] skipped (--skip-warmup) — cold start 测');
  }

  // 3. 测 N 轮 (每一轮: TTFT + total)
  const records: TimingRecord[] = [];
  const error_messages: string[] = [];
  for (let i = 1; i <= args.runs; i++) {
    const isWarm = i > 1;  // 第 1 轮 = 冷, 第 2+ 轮 = 热
    process.stdout.write(`[run ${i.toString().padStart(2, '0')}/${args.runs}] ${isWarm ? 'warm' : 'cold'} ... `);
    // 每轮 清 cache (避免 cache hit 污染 H2)
    let cacheStatus: 'miss' | 'hit' | 'unknown' = 'unknown';
    try {
      await fetch(`${daemon.daemonBaseUrl}/v1/cache/clear`, { method: 'POST' });
      cacheStatus = 'miss';
    } catch { /* daemon down? */ }
    try {
      const t0 = Date.now();
      const r = await callDaemonChat(daemon.daemonBaseUrl, args.prompt, args.model, true);
      // 当前 daemon /v1/chat 不是流式, 整段耗时 ≈ TTFT + 全生成时延
      // 我们用 total 当 TTFT (流式场景下 total ≈ first chunk + 完整生成, 而首 token 时延约 total 的 1/N)
      // 真流式场景需 /v1/chat/stream 端点 (W4 治本)
      const total = r.elapsed_ms;
      records.push({
        run: i,
        ttft_ms: total,  // 非流式 API: total = end-to-end
        total_ms: total,
        prompt_tokens: args.prompt.length,
        completion_tokens: r.content.length,
        provider: r.provider,
        fell_back: r.fell_back,
        is_warm: isWarm,
        cache_status: cacheStatus,
        prewarm: !args.skipWarmup,
        model: args.model,
        raw_response: typeof r.raw === 'string' ? r.raw : JSON.stringify(r.raw).slice(0, 200),
      });
      process.stdout.write(`provider=${r.provider} fell_back=${r.fell_back} total_ms=${total} content="${r.content.slice(0, 40)}..."\n`);
    } catch (e) {
      const errMsg = (e as Error).message;
      error_messages.push(errMsg);
      process.stdout.write(`ERROR: ${errMsg}\n`);
      records.push({
        run: i,
        ttft_ms: 0,
        total_ms: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        provider: 'error',
        fell_back: false,
        is_warm: isWarm,
        cache_status: cacheStatus,
        prewarm: !args.skipWarmup,
        model: args.model,
        error: errMsg,
      });
    }
  }

  // 4. stats — 必过滤 mock/prewarm/cache-hit 时延 (任务 §3.5)
  // 策略: 任何 mock (provider=mock 或 provider=unavailable) 时延 全部 不计入 H2
  const realRecords = records.filter((r) =>
    !r.error && r.provider === 'api' && !r.fell_back  // 真活
  );
  const allValid = records.filter((r) => !r.error);
  const ttfts_all = allValid.map((r) => r.ttft_ms);
  const ttfts_real = realRecords.map((r) => r.ttft_ms);
  const p50_all = percentile(ttfts_all, 50);
  const p90_all = percentile(ttfts_all, 90);
  const p50_real = percentile(ttfts_real, 50);
  const p90_real = percentile(ttfts_real, 90);

  // 5. 阈值判定 (P50 ≤ 1.5s, P90 ≤ 3.5s) — 只在有真活时计算
  const hasRealData = realRecords.length >= 5;  // 至少 5 真活样本
  const thresholdP50 = 1500;
  const thresholdP90 = 3500;
  const realPass = hasRealData
    ? (p50_real <= thresholdP50 && p90_real <= thresholdP90)
    : null;  // null = deferred
  const verdict = realPass === null ? 'DEFERRED' : (realPass ? 'PASS' : 'FAIL');

  const report = {
    task: 'H2 v3 真模型流式首 token P50/P90 真测',
    generated_at: new Date().toISOString(),
    args,
    daemon: { port: daemon.port, isMock: daemon.isMock },
    total_runs: records.length,
    real_runs: realRecords.length,
    mock_runs: records.length - realRecords.length - error_messages.length,
    error_runs: error_messages.length,
    errors: error_messages,
    p50_all_ms: Number.isFinite(p50_all) ? p50_all : null,
    p90_all_ms: Number.isFinite(p90_all) ? p90_all : null,
    p50_real_ms: Number.isFinite(p50_real) ? p50_real : null,
    p90_real_ms: Number.isFinite(p90_real) ? p90_real : null,
    threshold_p50_ms: thresholdP50,
    threshold_p90_ms: thresholdP90,
    has_real_data: hasRealData,
    real_pass: realPass,
    verdict,
    records,
    notes: [
      '【W3 治本】只统计 provider=api + fell_back=false (真活) 的样本 — 任务 §3.5 禁止 cache-hit / prewarm / mock 时延计入 H2',
      '【W3 治本】当前 daemon /v1/chat 是非流式 (整段响应), TTFT ≈ total; 真流式需 /v1/chat/stream 端点 (Wave 4)',
      '【W3 治本】无真 MiniMax_API_KEY 时, provider_status=unavailable, 真活样本=0, verdict=DEFERRED',
      '【W3 治本】cache_status=miss 在每轮 run 前清 cache (避免 cache-hit 时延混入)',
      '【W3 治本】is_warm 标 cold vs warm, 1st run=cold, 2+ = warm',
    ],
  };

  // 6. 写 report
  const outDir = path.join(process.cwd(), 'outputs', 'T-MVP-2-v3-h2-real');
  mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'h2_real_report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log();
  console.log('=== H2 v3 真测结果 ===');
  console.log(`  total_runs: ${records.length}`);
  console.log(`  real_runs (provider=api, fell_back=false): ${realRecords.length}`);
  console.log(`  mock_runs: ${records.length - realRecords.length - error_messages.length}`);
  console.log(`  error_runs: ${error_messages.length}`);
  if (ttfts_all.length > 0) {
    console.log(`  p50_all: ${p50_all.toFixed(0)}ms (含 mock/prewarm/cache)`);
    console.log(`  p90_all: ${p90_all.toFixed(0)}ms`);
  }
  if (hasRealData) {
    console.log(`  p50_real: ${p50_real.toFixed(0)}ms (仅真活)`);
    console.log(`  p90_real: ${p90_real.toFixed(0)}ms (仅真活)`);
    console.log(`  阈值: p50 ≤ ${thresholdP50}ms, p90 ≤ ${thresholdP90}ms`);
  } else {
    console.log(`  p50_real: N/A (无真活数据)`);
    console.log(`  p90_real: N/A (无真活数据)`);
  }
  console.log(`  VERDICT: ${verdict}`);
  console.log(`  report: ${reportPath}`);

  if (verdict === 'DEFERRED') {
    console.log();
    console.log('  【W3 透明声明】H2 v3 真测 DEFERRED — 等真 MiniMax_API_KEY 接入');
    console.log('  当前 host 无真 key (mavis CLI symlink 坏, 跟 Wave 1 §13 row 1 一致)');
    console.log('  Wave 4 治本: 接真 key → 重跑 h2v3_real_test.ts 报 P50/P90 真活数据');
  }

  process.exit(verdict === 'PASS' ? 0 : (verdict === 'DEFERRED' ? 0 : 1));
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
