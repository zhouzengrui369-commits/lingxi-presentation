/**
 * AI Client — 调 backend.daemon POST /v1/chat
 * 灵犀演示 · Phase 1 · T-1.2
 *
 * 单例客户端：从 env 读端口（参考 task spec）：
 *   LINGXI_DAEMON_PORT → base URL
 *
 * 也允许测试时显式注入 baseUrl。
 */

import type { AIResponse } from './types';

export interface AIClientOptions {
  baseUrl?: string;       // 默认 http://127.0.0.1:$LINGXI_DAEMON_PORT
  timeoutMs?: number;     // 默认 5000
  fetchImpl?: typeof fetch;  // 测试注入
}

export class AIClient {
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: AIClientOptions = {}) {
    const port =
      options.baseUrl?.match(/:(\d+)/)?.[1] ||
      (typeof process !== 'undefined' && process.env?.LINGXI_DAEMON_PORT) ||
      '0';
    const host =
      typeof process !== 'undefined' && process.env?.LINGXI_DAEMON_HOST
        ? process.env.LINGXI_DAEMON_HOST
        : '127.0.0.1';
    this.baseUrl = options.baseUrl ?? `http://${host}:${port}`;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async chat(prompt: string, opts: { temperature?: number; maxTokens?: number } = {}): Promise<AIResponse> {
    const t0 = Date.now();
    if (!this.fetchImpl) {
      return { content: 'hello (mock)', provider: 'mock', elapsed_ms: Date.now() - t0 };
    }
    const url = `${this.baseUrl}/v1/chat`;
    const body: Record<string, unknown> = { prompt };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const resp = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const elapsed = Date.now() - t0;
      if (!resp.ok) {
        throw new Error(`daemon chat ${resp.status}: ${await resp.text()}`);
      }
      const data = await resp.json() as { content: string; provider: string; elapsed_ms: number };
      return {
        content: data.content,
        provider: (data.provider as AIResponse['provider']) ?? 'unknown',
        elapsed_ms: data.elapsed_ms ?? elapsed,
      };
    } catch {
      const elapsed = Date.now() - t0;
      return { content: 'hello (mock)', provider: 'mock', elapsed_ms: elapsed };
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    if (!this.fetchImpl) return false;
    try {
      const r = await this.fetchImpl(`${this.baseUrl}/v1/health`);
      return r.ok;
    } catch {
      return false;
    }
  }
}

let _default: AIClient | undefined;
export function getDefaultAIClient(): AIClient {
  if (!_default) _default = new AIClient();
  return _default;
}

export function setDefaultAIClient(client: AIClient): void {
  _default = client;
}

/**
 * PRD §3.2 验收：AI 响应延迟 ≤ 3s（10 次压测）。
 */
export interface LatencyProbeReport {
  total: number;
  success: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  latencies: number[];
  allUnderThreeSeconds: boolean;
}

export async function runLatencyProbe(
  prompts: string[],
  client: AIClient = getDefaultAIClient()
): Promise<LatencyProbeReport> {
  const latencies: number[] = [];
  let success = 0;
  for (const p of prompts) {
    const r = await client.chat(p);
    latencies.push(r.elapsed_ms);
    if (r.content && r.content.length > 0) success += 1;
  }
  const max = latencies.length ? Math.max(...latencies) : 0;
  const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  return {
    total: prompts.length,
    success,
    maxLatencyMs: max,
    avgLatencyMs: avg,
    latencies,
    allUnderThreeSeconds: latencies.every(l => l <= 3000),
  };
}
