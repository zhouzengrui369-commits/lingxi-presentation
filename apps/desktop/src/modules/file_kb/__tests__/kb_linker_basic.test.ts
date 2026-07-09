/**
 * test_kb_linker_basic — 验证 KB 关联补全（给 T-1.2 advisor 用）
 * 灵犀演示 · Phase 1 · T-1.1
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { KbStorage, WikiKbEntry, FileImportRecord, uuidv4, _resetStorageCache } from '../storage';
import { linkKb, tokenize, toSuggestions, suggestRelatedFiles } from '../kb_linker';

describe('kb_linker: basic association', () => {
  let tmpRoot: string;
  let storage: KbStorage;

  beforeEach(async () => {
    _resetStorageCache();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lingxi_linker_'));
    storage = new KbStorage(tmpRoot);
    await storage.init();

    // seed: 3 个文件 + 3 个 wiki 条目（其中 #2、#3 关联 file_2）
    const f1: FileImportRecord = {
      file_id: '11111111-1111-4111-8111-111111111111',
      path: '/x/a.md',
      name: 'a.md',
      size_bytes: 100,
      format: 'md',
      imported_at: new Date().toISOString(),
      status: 'ok',
      error: null,
    };
    const f2: FileImportRecord = {
      file_id: '22222222-2222-4222-8222-222222222222',
      path: '/x/b.docx',
      name: 'b.docx',
      size_bytes: 200,
      format: 'docx',
      imported_at: new Date().toISOString(),
      status: 'ok',
      error: null,
    };
    const f3: FileImportRecord = {
      file_id: '33333333-3333-4333-8333-333333333333',
      path: '/x/c.pdf',
      name: 'c.pdf',
      size_bytes: 300,
      format: 'pdf',
      imported_at: new Date().toISOString(),
      status: 'ok',
      error: null,
    };
    await storage.putFile(f1);
    await storage.putFile(f2);
    await storage.putFile(f3);

    const longSummary1 = 'Q1 季度汇报关键业绩：营收达成率 108%，同比增长 23%。AI 产品线贡献占比从 28% 提升至 41%，已成为第一大营收支柱。新增企业客户 14 家，流失 3 家。';
    const longSummary2 = '海外市场拓展：东南亚 3 个 POC 客户进入商务谈判，预期 Q2 落地 1-2 单。同时评估日本与韩国市场，初步建立本地化运营团队编制三人。';
    const longSummary3 = '团队扩张：从 12 人到 18 人，新引入 2 名高级 AI 工程师专注 LLM Wiki 整理方向。同步建立工程效率小组，覆盖 CI、自动化测试与基础设施。';

    const e1: WikiKbEntry = {
      entry_id: uuidv4(),
      title: 'Q1 季度汇报关键业绩',
      summary: longSummary1,
      tags: ['季度汇报', '营收', 'AI产品线'],
      related_files: [f1.file_id],
      created_at: new Date().toISOString(),
      confidence: 0.92,
    };
    const e2: WikiKbEntry = {
      entry_id: uuidv4(),
      title: '海外市场拓展',
      summary: longSummary2,
      tags: ['海外', 'POC', '商务谈判'],
      related_files: [f2.file_id],
      created_at: new Date().toISOString(),
      confidence: 0.85,
    };
    const e3: WikiKbEntry = {
      entry_id: uuidv4(),
      title: '团队扩张',
      summary: longSummary3,
      tags: ['团队', '招聘', 'AI工程师'],
      related_files: [f2.file_id],
      created_at: new Date().toISOString(),
      confidence: 0.7,
    };
    await storage.putEntry(e1);
    await storage.putEntry(e2);
    await storage.putEntry(e3);
    await storage.flush();
  });

  afterEach(async () => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('tokenize mixes CJK 2-gram + english words', () => {
    const tokens = tokenize('季度汇报 Q1 review 营收 growth');
    expect(tokens).toContain('季度汇报');
    expect(tokens).toContain('q1');
    expect(tokens).toContain('review');
    expect(tokens).toContain('营收');
    expect(tokens).toContain('growth');
  });

  it('linkKb matches "季度汇报" to entry with that tag/title', async () => {
    const r = await linkKb('季度汇报', storage);
    expect(r.entries.length).toBeGreaterThan(0);
    const top = r.entries[0];
    expect(top.entry.tags).toContain('季度汇报');
    expect(top.matched_in).toContain('tags');
  });

  it('linkKb ranks entries by score × confidence', async () => {
    const r = await linkKb('海外 商务谈判', storage);
    expect(r.entries.length).toBeGreaterThan(0);
    // 排第一应该是 "海外市场拓展"（title + summary + tag 多处命中）
    expect(r.entries[0].entry.title).toContain('海外');
  });

  it('toSuggestions returns KB-derived suggestions with evidence', async () => {
    const r = await linkKb('季度汇报', storage);
    const sugg = toSuggestions(r, 'topic', ['季度汇报', '半年汇报']);
    expect(sugg.length).toBeGreaterThan(0);
    expect(sugg[0].source).toBe('kb');
    expect(sugg[0].evidence_entry_id).toBeTruthy();
  });

  it('toSuggestions falls back to fallback pool when KB empty', async () => {
    const r = await linkKb('绝对没有匹配的关键字xyz123abc', storage);
    const sugg = toSuggestions(r, 'topic', ['兜底选项 A', '兜底选项 B']);
    expect(sugg.length).toBe(2);
    expect(sugg[0].source).toBe('fallback');
  });

  it('suggestRelatedFiles surfaces files referenced by KB entries', async () => {
    // 用户已经引用了 file_1（季度汇报），应该建议 file_2 (海外/团队都引用了)
    const suggestions = await suggestRelatedFiles(['11111111-1111-4111-8111-111111111111'], storage);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].file.file_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(suggestions[0].matched_entries.length).toBeGreaterThanOrEqual(2);
  });
});