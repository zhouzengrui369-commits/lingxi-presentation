/**
 * test_wiki_auto_organize — 验证 LLM Wiki 整理（daemon 不可达 → 走本地启发式）
 * 灵犀演示 · Phase 1 · T-1.1
 */
import { importFile } from '../importer';
import { organizeToWiki } from '../wiki';
import * as path from 'path';

describe('wiki: auto-organize', () => {
  it('organizes docx into wiki entry (forceLocal, no daemon)', async () => {
    const sample = path.resolve(__dirname, '../../../../../testdata/docx_sample.docx');
    const ir = await importFile(sample);
    expect(ir.text.length).toBeGreaterThan(50);

    const entry = await organizeToWiki(ir, { forceLocal: true });
    expect(entry.entry_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.title.length).toBeGreaterThan(0);
    expect(entry.title.length).toBeLessThanOrEqual(200);
    // schema: summary ≥ 50 chars
    expect(entry.summary.length).toBeGreaterThanOrEqual(50);
    expect(entry.summary.length).toBeLessThanOrEqual(1000);
    // tags ≥ 1
    expect(entry.tags.length).toBeGreaterThanOrEqual(1);
    expect(entry.tags.length).toBeLessThanOrEqual(10);
    expect(entry.related_files).toContain(ir.record.file_id);
    expect(entry.confidence).toBeGreaterThanOrEqual(0);
    expect(entry.confidence).toBeLessThanOrEqual(1);
    // 本地兜底 confidence 固定 0.4
    expect(entry.confidence).toBe(0.4);
  });

  it('falls back to local heuristic when daemon is unreachable', async () => {
    const sample = path.resolve(__dirname, '../../../../../testdata/md_sample.md');
    const ir = await importFile(sample);

    // 用一个 unreachable URL；用 fetch mock 让其快速 reject
    const fetchMock: typeof fetch = async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:1');
    };
    const entry = await organizeToWiki(ir, {
      daemonUrl: 'http://127.0.0.1:1',
      timeoutMs: 1000,
      fetchImpl: fetchMock,
    });
    // 没崩 + 走兜底 + confidence 0.4
    expect(entry.confidence).toBe(0.4);
    expect(entry.summary).toContain('来源');
  });

  it('uses daemon response when valid JSON returned', async () => {
    const sample = path.resolve(__dirname, '../../../../../testdata/md_sample.md');
    const ir = await importFile(sample);

    const fakeJson = JSON.stringify({
      title: 'AI 顾问引导的季度汇报生成',
      summary: '本季度我们完成了 AI 顾问引导从需求澄清到 HTML 预览生成的端到端流程上线。覆盖 5 大模块，10 次 demo 零失败，PRD 硬指标全达成。',
      tags: ['季度汇报', 'AI顾问', '端到端'],
      confidence: 0.88,
    });
    const fetchMock: typeof fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: fakeJson, provider: 'mock' }),
    })) as unknown as typeof fetch;

    const entry = await organizeToWiki(ir, {
      daemonUrl: 'http://fake-daemon',
      timeoutMs: 5000,
      fetchImpl: fetchMock,
    });
    expect(entry.title).toBe('AI 顾问引导的季度汇报生成');
    expect(entry.confidence).toBe(0.88);
    expect(entry.tags).toContain('AI顾问');
  });
});