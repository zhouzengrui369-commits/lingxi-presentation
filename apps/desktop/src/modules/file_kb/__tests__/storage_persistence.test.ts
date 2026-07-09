/**
 * test_storage_persistence — 验证 KB 本地持久化
 * 灵犀演示 · Phase 1 · T-1.1
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { KbStorage, FileImportRecord, WikiKbEntry, uuidv4, resolveKbRoot, _resetStorageCache } from '../storage';

describe('storage: persistence', () => {
  let tmpRoot: string;

  beforeEach(() => {
    _resetStorageCache();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lingxi_kb_'));
  });

  afterEach(async () => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('persists file records and wiki entries, survives re-init', async () => {
    const s1 = new KbStorage(tmpRoot);
    await s1.init();
    const fileId = uuidv4();
    const file: FileImportRecord = {
      file_id: fileId,
      path: '/abs/test.docx',
      name: 'test.docx',
      size_bytes: 1234,
      format: 'docx',
      imported_at: new Date().toISOString(),
      status: 'ok',
      error: null,
    };
    await s1.putFile(file);

    const entryId = uuidv4();
    const entry: WikiKbEntry = {
      entry_id: entryId,
      title: '测试条目',
      summary: '这是一个测试摘要，必须大于等于 50 字符才能通过 schema 校验，确保长度足够。',
      tags: ['测试'],
      related_files: [fileId],
      created_at: new Date().toISOString(),
      confidence: 0.5,
    };
    await s1.putEntry(entry);
    await s1.flush();

    // 重新开一个 storage，验证落盘
    _resetStorageCache();
    const s2 = new KbStorage(tmpRoot);
    await s2.init();
    const got = await s2.getFile(fileId);
    expect(got).toBeTruthy();
    expect(got!.name).toBe('test.docx');
    const gotEntry = await s2.getEntry(entryId);
    expect(gotEntry).toBeTruthy();
    expect(gotEntry!.title).toBe('测试条目');

    const files = await s2.listFiles();
    expect(files.length).toBeGreaterThanOrEqual(1);
    const entries = await s2.listEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const manifest = s2.getManifest();
    expect(manifest.file_count).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid file_id (not UUID v4)', async () => {
    const s = new KbStorage(tmpRoot);
    await s.init();
    await expect(
      s.putFile({
        file_id: 'not-a-uuid',
        path: '/x.docx',
        name: 'x.docx',
        size_bytes: 1,
        format: 'docx',
        imported_at: new Date().toISOString(),
        status: 'ok',
        error: null,
      }),
    ).rejects.toThrow(/UUID v4/);
  });

  it('rejects summary shorter than schema min (50)', async () => {
    const s = new KbStorage(tmpRoot);
    await s.init();
    await expect(
      s.putEntry({
        entry_id: uuidv4(),
        title: 't',
        summary: 'too short',
        tags: ['x'],
        related_files: [],
        created_at: new Date().toISOString(),
        confidence: 0.5,
      }),
    ).rejects.toThrow(/summary length/);
  });

  it('resolves KB root across platforms (macOS layout)', () => {
    process.env.LINGXI_KB_ROOT = tmpRoot;
    expect(resolveKbRoot()).toBe(path.resolve(tmpRoot));
    delete process.env.LINGXI_KB_ROOT;
  });

  it('writes files under kb/files/ and entries under kb/entries/', async () => {
    const s = new KbStorage(tmpRoot);
    await s.init();
    const fid = uuidv4();
    await s.putFile({
      file_id: fid,
      path: '/abs/x.pdf',
      name: 'x.pdf',
      size_bytes: 100,
      format: 'pdf',
      imported_at: new Date().toISOString(),
      status: 'ok',
      error: null,
    });
    const eid = uuidv4();
    await s.putEntry({
      entry_id: eid,
      title: 't',
      summary: 'summary 必须够五十字确保通过 schema 校验的填充文案这里就是填充。',
      tags: ['x'],
      related_files: [fid],
      created_at: new Date().toISOString(),
      confidence: 0.5,
    });
    await s.flush();

    expect(fs.existsSync(path.join(tmpRoot, 'files', `${fid}.json`))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'entries', `${eid}.json`))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'index.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'manifest.json'))).toBe(true);
  });
});