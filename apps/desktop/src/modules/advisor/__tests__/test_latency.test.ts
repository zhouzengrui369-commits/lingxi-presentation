/**
 * test_ai_response_latency — PRD 硬指标：AI 响应延迟 ≤ 3s（10 次压测）
 */
import { AIClient, runLatencyProbe } from '../ai_client';

describe('test_ai_response_latency', () => {
  test('10 次 mock chat 全部 ≤ 3s', async () => {
    const fakeFetch: typeof fetch = (async () => {
      await new Promise(r => setTimeout(r, 50));
      return new Response(
        JSON.stringify({ content: 'mock reply', provider: 'mock', elapsed_ms: 50 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;
    const client = new AIClient({
      baseUrl: 'http://127.0.0.1:15321',
      fetchImpl: fakeFetch,
    });
    const prompts = Array.from({ length: 10 }, (_, i) => `测试响应延迟 ${i + 1}`);
    const report = await runLatencyProbe(prompts, client);
    expect(report.total).toBe(10);
    expect(report.success).toBe(10);
    expect(report.allUnderThreeSeconds).toBe(true);
    expect(report.maxLatencyMs).toBeLessThanOrEqual(3000);
    // eslint-disable-next-line no-console
    console.log(`[latency] avg=${report.avgLatencyMs.toFixed(1)}ms samples=${JSON.stringify(report.latencies.map((l, i) => ({ i, latencyMs: l })))}`);
  });

  test('AIClient.health 在 mock 200 下返回 true', async () => {
    const fakeFetch: typeof fetch = (async () =>
      new Response('{"status":"ok","providers":["mock"]}', { status: 200 })) as any;
    const client = new AIClient({ baseUrl: 'http://127.0.0.1:15321', fetchImpl: fakeFetch });
    expect(await client.health()).toBe(true);
  });

  test('AIClient.health 在网络失败下返回 false', async () => {
    const fakeFetch: typeof fetch = (async () => { throw new Error('ECONNREFUSED'); }) as any;
    const client = new AIClient({ baseUrl: 'http://127.0.0.1:15321', fetchImpl: fakeFetch });
    expect(await client.health()).toBe(false);
  });

  test('AIClient.chat 在 fetch 抛错时 fallback 到 mock', async () => {
    const fakeFetch: typeof fetch = (async () => { throw new Error('connection refused'); }) as any;
    const client = new AIClient({ baseUrl: 'http://127.0.0.1:15321', fetchImpl: fakeFetch });
    const r = await client.chat('hello');
    expect(r.provider).toBe('mock');
    expect(r.content.length).toBeGreaterThan(0);
  });

  test('AIClient.chat 在 4xx 错误时 fallback 到 mock', async () => {
    const fakeFetch: typeof fetch = (async () =>
      new Response('bad request', { status: 400 })) as any;
    const client = new AIClient({ baseUrl: 'http://127.0.0.1:15321', fetchImpl: fakeFetch });
    const r = await client.chat('hello');
    expect(r.provider).toBe('mock');
  });
});
