/**
 * ai_revise 单测（T-1.4）
 * - test_ai_revise_endpoint
 */
import {
  reviseWithAI,
  buildRevisePrompt,
  parseSectionsFromContent,
  type FetchLike,
} from '../ai_revise';
import { buildPreviewPage } from '../renderer';

test('test_ai_revise_endpoint', async () => {
  let capturedUrl = '';
  let capturedBody: any = null;
  // mock daemon POST /v1/chat：返回结构化 JSON sections
  const fakeFetch: FetchLike = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init!.body as string);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content:
          '{"sections":[{"heading":"面向投资人的增长故事","content_html":"<p>ARR 翻倍</p>","image_urls":[]}]}',
        provider: 'cli',
        fell_back: false,
        elapsed_ms: 42,
      }),
      text: async () => '',
    };
  };

  const current = buildPreviewPage(
    [{ heading: '旧标题', content_html: '<p>旧</p>', image_urls: [] }],
    { latencyMs: 0 },
  );

  const result = await reviseWithAI({
    requirement: '换成面向投资人的叙事',
    currentPage: current,
    daemonBaseUrl: 'http://127.0.0.1:38890',
    fetchImpl: fakeFetch,
  });

  // 打到正确 endpoint
  expect(capturedUrl).toBe('http://127.0.0.1:38890/v1/chat');
  // prompt 含新需求
  expect(capturedBody.prompt).toContain('面向投资人');
  // 产出 schema-valid PreviewPage
  expect(result.page.html).toContain('<!DOCTYPE html>');
  expect(result.page.sections[0].heading).toBe('面向投资人的增长故事');
  expect(result.page.sections[0].content_html).toBe('<p>ARR 翻倍</p>');
  // 重做保留同一 preview_id（原地更新）
  expect(result.page.preview_id).toBe(current.preview_id);
  // 延迟被测量
  expect(typeof result.latency_ms).toBe('number');
  expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  expect(result.provider).toBe('cli');

  // 空需求抛错
  await expect(
    reviseWithAI({ requirement: '  ', daemonBaseUrl: 'http://x', fetchImpl: fakeFetch }),
  ).rejects.toThrow();

  // daemon 非 2xx 抛错
  const errFetch: FetchLike = async () => ({
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () => 'provider_both_failed',
  });
  await expect(
    reviseWithAI({ requirement: 'x', daemonBaseUrl: 'http://x', fetchImpl: errFetch }),
  ).rejects.toThrow(/502/);
});

test('parseSectionsFromContent 容错三级降级', () => {
  // 1. 纯 JSON
  const a = parseSectionsFromContent('{"sections":[{"heading":"H","content_html":"<p>x</p>","image_urls":[]}]}');
  expect(a[0].heading).toBe('H');

  // 2. JSON 带前后缀（模型加了解释）
  const b = parseSectionsFromContent('好的，结果如下：\n{"sections":[{"heading":"H2","content_html":"<p>y</p>"}]}\n完成');
  expect(b[0].heading).toBe('H2');
  expect(b[0].image_urls).toEqual([]);

  // 3. 非 JSON 纯文本 → 退化为单章节，不丢内容
  const c = parseSectionsFromContent('第一段内容\n\n第二段内容');
  expect(c.length).toBe(1);
  expect(c[0].content_html).toContain('第一段内容');
  expect(c[0].content_html).toContain('第二段内容');
});

test('buildRevisePrompt 含当前章节上下文', () => {
  const current = buildPreviewPage(
    [
      { heading: '章节一', content_html: '<p>1</p>', image_urls: [] },
      { heading: '章节二', content_html: '<p>2</p>', image_urls: [] },
    ],
    {},
  );
  const prompt = buildRevisePrompt('精简', current);
  expect(prompt).toContain('精简');
  expect(prompt).toContain('章节一');
  expect(prompt).toContain('章节二');
  expect(prompt).toContain('JSON');
});
