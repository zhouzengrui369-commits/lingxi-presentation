/**
 * test_storage_real_path — Phase 6 · T-6.2 LLM Wiki KB 真持久化
 *
 * 验收信号 (phase6_plan.md T-6.2 line 110-114):
 *   - macOS 平台 getKbRoot() 返回 ~/Library/Application Support/灵犀演示/kb (PRD 3.1 硬要求)
 *   - cross-platform fallback: linux → ~/.config/灵犀演示/kb, win → %APPDATA%/灵犀演示/kb
 *   - ensureKbDir() 幂等 mkdir recursive (kb/ + files/ + entries/)
 *   - 5 文件导入 → 5 个 wiki entry JSON 落地
 *
 * Mocking 策略 (T-6.2 钉子 #30):
 *   - os.homedir 在 jest VM 环境下 configurable=false, Object.defineProperty 抛 TypeError
 *   - process.platform configurable=true 但同样不可靠
 *   - 解法: storage.ts 暴露 _resolveKbRootWith (纯函数, 接受 platform/home/env) + ensureKbDir(override)
 *   - 跨平台 path 用 _resolveKbRootWith 测 (无 mock); 集成测用 ensureKbDir(fakeRoot) 测
 *
 * 灵犀演示 · Phase 6 · T-6.2
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  getKbRoot,
  resolveKbRoot,
  _resolveKbRootWith,
  ensureKbDir,
  kbDirInfo,
  KbStorage,
  uuidv4,
  _resetStorageCache,
} from '../storage';
import type { FileImportRecord, WikiKbEntry } from '../storage';

describe('storage: real path resolution (Phase 6 T-6.2)', () => {
  const ORIG_LINGXI = process.env.LINGXI_KB_ROOT;
  const realHome = os.homedir();
  const realPlatform = process.platform;
  const fakeHome = path.join(os.tmpdir(), 'lingxi_t62_home');

  beforeEach(() => {
    if (fs.existsSync(fakeHome)) {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
    fs.mkdirSync(fakeHome, { recursive: true });
    delete process.env.LINGXI_KB_ROOT;
    _resetStorageCache();
  });

  afterEach(() => {
    if (ORIG_LINGXI) process.env.LINGXI_KB_ROOT = ORIG_LINGXI;
    else delete process.env.LINGXI_KB_ROOT;
  });

  // ----------------------------------------------------------------------
  // 1. macOS (default on M-series CI/dev) — PRD 3.1 唯一硬要求
  // ----------------------------------------------------------------------
  it('macOS: getKbRoot() returns ~/Library/Application Support/灵犀演示/kb (PRD 3.1)', () => {
    const root = _resolveKbRootWith({ platform: 'darwin', home: realHome, env: {} });
    const expected = path.join(realHome, 'Library', 'Application Support', '灵犀演示', 'kb');
    expect(root).toBe(expected);
    // 关键断言: 包含中文 app dir name (PRD 3.1 中文 binary 命名)
    expect(root).toContain('灵犀演示');
    expect(root).toContain('kb');
    expect(root).not.toContain('lingxi-demo-electron'); // Phase 5 旧错路径已废
  });

  // ----------------------------------------------------------------------
  // 2. Linux fallback → ~/.config/灵犀演示/kb (T-6.2 spec)
  // ----------------------------------------------------------------------
  it('linux: getKbRoot() returns ~/.config/灵犀演示/kb (T-6.2 spec)', () => {
    const root = _resolveKbRootWith({ platform: 'linux', home: fakeHome, env: {} });
    const expected = path.join(fakeHome, '.config', '灵犀演示', 'kb');
    expect(root).toBe(expected);
  });

  // ----------------------------------------------------------------------
  // 3. Windows fallback → %APPDATA%/灵犀演示/kb
  // ----------------------------------------------------------------------
  it('win32: getKbRoot() returns %APPDATA%/灵犀演示/kb', () => {
    const fakeAppData = path.join(fakeHome, 'AppData', 'Roaming');
    fs.mkdirSync(fakeAppData, { recursive: true });
    const root = _resolveKbRootWith({
      platform: 'win32',
      home: fakeHome,
      env: { APPDATA: fakeAppData },
    });
    const expected = path.join(fakeAppData, '灵犀演示', 'kb');
    expect(root).toBe(expected);
  });

  // ----------------------------------------------------------------------
  // 4. Windows fallback (no APPDATA env) → $HOME/AppData/Roaming/灵犀演示/kb
  // ----------------------------------------------------------------------
  it('win32: getKbRoot() falls back to $HOME/AppData/Roaming when APPDATA is unset', () => {
    const root = _resolveKbRootWith({ platform: 'win32', home: fakeHome, env: {} });
    const expected = path.join(fakeHome, 'AppData', 'Roaming', '灵犀演示', 'kb');
    expect(root).toBe(expected);
  });

  // ----------------------------------------------------------------------
  // 5. LINGXI_KB_ROOT override (test escape hatch)
  // ----------------------------------------------------------------------
  it('LINGXI_KB_ROOT env var overrides platform path (test escape hatch)', () => {
    const customRoot = path.join(fakeHome, 'custom-kb');
    const root = _resolveKbRootWith({
      platform: 'darwin',
      home: realHome,
      env: { LINGXI_KB_ROOT: customRoot },
    });
    expect(root).toBe(path.resolve(customRoot));
  });

  // ----------------------------------------------------------------------
  // 6. ensureKbDir idempotent + 3 dirs created + KB_DIR_INFO logged
  // ----------------------------------------------------------------------
  it('ensureKbDir: creates kb/ + files/ + entries/, idempotent, logs KB_DIR_INFO', async () => {
    // 用 override → 走 fakeHome 不污染真 KB 路径
    const overrideRoot = path.join(fakeHome, 'kb_test');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      // 第一次 — 创建
      const root1 = await ensureKbDir(overrideRoot);
      expect(root1).toBe(overrideRoot);
      expect(fs.existsSync(root1)).toBe(true);
      expect(fs.existsSync(path.join(root1, 'files'))).toBe(true);
      expect(fs.existsSync(path.join(root1, 'entries'))).toBe(true);

      // 第二次 — idempotent (不 throw, 同样 root)
      const root2 = await ensureKbDir(overrideRoot);
      expect(root2).toBe(overrideRoot);

      // 第三次 — 不同 override (testing parameter)
      const overrideRoot2 = path.join(fakeHome, 'kb_test_2');
      const root3 = await ensureKbDir(overrideRoot2);
      expect(root3).toBe(overrideRoot2);
      expect(fs.existsSync(path.join(overrideRoot2, 'files'))).toBe(true);
      expect(fs.existsSync(path.join(overrideRoot2, 'entries'))).toBe(true);

      // KB_DIR_INFO 落 log 至少 3 次 (3 次 ensureKbDir 各一次)
      const kbDirInfoLogs = logSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].startsWith('KB_DIR_INFO'),
      );
      expect(kbDirInfoLogs.length).toBeGreaterThanOrEqual(3);

      // 验证 KB_DIR_INFO 内容含 platform + root + sub-dirs
      const lastLog = kbDirInfoLogs[kbDirInfoLogs.length - 1][0] as string;
      expect(lastLog).toMatch(/platform=/);
      expect(lastLog).toContain(overrideRoot2);
      expect(lastLog).toContain('files_dir=');
      expect(lastLog).toContain('entries_dir=');
      expect(lastLog).toContain('index_path=');
      expect(lastLog).toContain('manifest_path=');
    } finally {
      logSpy.mockRestore();
    }
  });

  // ----------------------------------------------------------------------
  // 7. 5 文件导入 → 5 wiki entry JSON 落地 (T-6.2 验收信号)
  // ----------------------------------------------------------------------
  it('5 imports → 5 file records + 5 wiki entries persisted (using override path)', async () => {
    // 用 override 避免污染真 PRD 3.1 路径
    const overrideRoot = path.join(fakeHome, 'kb_5_imports');
    await ensureKbDir(overrideRoot);
    _resetStorageCache();

    const s = new KbStorage(overrideRoot);
    await s.init();
    expect(s.root).toBe(overrideRoot);

    // 5 个 fake file import + wiki entry
    const N = 5;
    const titles = [
      'Q1 业绩报告',
      'Q1 产品里程碑',
      'Q1 关键指标',
      'Q1 团队总结',
      'Q1 财务明细',
    ];
    for (let i = 0; i < N; i++) {
      const fileId = uuidv4();
      const entryId = uuidv4();
      const file: FileImportRecord = {
        file_id: fileId,
        path: `/abs/Q1_${i}.docx`,
        name: `Q1_${i}.docx`,
        size_bytes: 1024 * (i + 1),
        format: 'docx',
        imported_at: new Date().toISOString(),
        status: 'ok',
        error: null,
      };
      const entry: WikiKbEntry = {
        entry_id: entryId,
        title: titles[i],
        summary: `这是第 ${i + 1} 份文件自动生成的 wiki 条目, 必须保证 summary 字符数大于等于 50 才能通过 schema 校验所以这里需要填充足够的内容, 我们继续填充确保长度覆盖边界。`,
        tags: ['Q1', `tag${i}`],
        related_files: [fileId],
        created_at: new Date().toISOString(),
        confidence: 0.7 + i * 0.05,
      };
      await s.putFile(file);
      await s.putEntry(entry);
    }
    await s.flush();

    // 落盘 verify — 5 个 file JSON + 5 个 entry JSON + index + manifest
    const files = fs.readdirSync(path.join(overrideRoot, 'files'));
    const entries = fs.readdirSync(path.join(overrideRoot, 'entries'));
    expect(files.length).toBe(N);
    expect(entries.length).toBe(N);

    for (const f of files) {
      expect(f).toMatch(/^[0-9a-f-]{36}\.json$/);
    }
    for (const e of entries) {
      expect(e).toMatch(/^[0-9a-f-]{36}\.json$/);
    }

    // 验证 index.json + manifest.json
    const idxRaw = fs.readFileSync(path.join(overrideRoot, 'index.json'), 'utf-8');
    const idx = JSON.parse(idxRaw);
    expect(idx.files.length).toBe(N);
    expect(idx.entries.length).toBe(N);

    const mfRaw = fs.readFileSync(path.join(overrideRoot, 'manifest.json'), 'utf-8');
    const mf = JSON.parse(mfRaw);
    expect(mf.file_count).toBe(N);
    expect(mf.entry_count).toBe(N);
  });

  // ----------------------------------------------------------------------
  // 8. kbDirInfo returns correct shape (T-6.2 spec)
  // ----------------------------------------------------------------------
  it('kbDirInfo: returns platform + root + 4 sub-paths (UI debug helper)', () => {
    const overrideRoot = path.join(fakeHome, 'kb_info_test');
    const info = kbDirInfo(overrideRoot);
    expect(info.root).toBe(overrideRoot);
    expect(info.files_dir).toBe(path.join(overrideRoot, 'files'));
    expect(info.entries_dir).toBe(path.join(overrideRoot, 'entries'));
    expect(info.index_path).toBe(path.join(overrideRoot, 'index.json'));
    expect(info.manifest_path).toBe(path.join(overrideRoot, 'manifest.json'));
    expect(typeof info.platform).toBe('string');
  });

  // ----------------------------------------------------------------------
  // 9. getKbRoot === resolveKbRoot (alias, back-compat)
  // ----------------------------------------------------------------------
  it('getKbRoot === resolveKbRoot (alias, back-compat for Phase 1 callers)', () => {
    const override = path.join(fakeHome, 'alias-test');
    expect(getKbRoot(override)).toBe(resolveKbRoot(override));
  });

  // ----------------------------------------------------------------------
  // 10. resolveKbRoot on real host gives the real PRD 3.1 macOS path
  // ----------------------------------------------------------------------
  it('resolveKbRoot on real macOS host: real os.homedir path (no mock)', () => {
    if (realPlatform !== 'darwin') {
      // 跳过 — 非 darwin 平台不验证 (PRD 3.1 唯一硬要求是 macOS)
      return;
    }
    const root = resolveKbRoot();
    // 真 macOS 上: ~/Library/Application Support/灵犀演示/kb
    expect(root).toBe(path.join(realHome, 'Library', 'Application Support', '灵犀演示', 'kb'));
    // 包含中文 app dir name
    expect(root).toContain('灵犀演示');
    expect(root).toContain('kb');
  });
});
