/**
 * 本地 KB 持久化 — T-1.1 文件管理与 LLM Wiki 知识库
 *
 * 存储位置（PRD 硬约束：仅本地，不上传云端）：
 *   macOS: ~/Library/Application Support/灵犀演示/kb/
 *   Windows: %APPDATA%/灵犀演示/kb/
 *   Linux/other: ~/.lingxi/kb/  (开发/CI 兜底)
 *
 * 存储结构（无 SQLite 依赖，纯 JSON 落盘，方便人工 review）：
 *   kb/
 *   ├── files/                # file_import 记录（一份一个 JSON）
 *   │   └── <file_id>.json
 *   ├── entries/              # wiki_kb 记录
 *   │   └── <entry_id>.json
 *   ├── index.json            # 轻量索引（最近 200 条 file_id + entry_id），启动加载
 *   └── manifest.json         # 库元信息（version / created_at / counts）
 *
 * 设计取舍：
 *   - 单文件 < 100KB，避免大 JSON 序列化开销
 *   - 所有 UUID 都用 RFC 4122 v4（crypto.randomUUID() 兜底）
 *   - 写操作 atomic：先写 .tmp 再 rename，避免半写状态
 *   - 索引文件单独维护，避免每次扫目录（O(1) 启动）
 *
 * 灵犀演示 · Phase 1 · T-1.1
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

// ---- Types ----

/** file_import.schema.json 严格子集（contract 在 contracts/file_import.schema.json） */
export interface FileImportRecord {
  file_id: string;
  path: string;
  name: string;
  size_bytes: number;
  format: 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'md' | 'jpg' | 'png';
  imported_at: string;
  status: 'ok' | 'failed' | 'partial';
  error: string | null;
}

/** wiki_kb.schema.json 严格子集 */
export interface WikiKbEntry {
  entry_id: string;
  title: string;
  summary: string;
  tags: string[];
  related_files: string[];
  created_at: string;
  confidence: number;
}

/** KB 索引（启动加载到内存，O(1) 列出） */
export interface KbIndex {
  files: string[]; // file_id list (most recent last)
  entries: string[]; // entry_id list (most recent last)
}

/** KB manifest（库元信息） */
export interface KbManifest {
  version: string;
  created_at: string;
  file_count: number;
  entry_count: number;
  total_size_bytes: number;
}

// ---- Path resolution ----

const APP_DIR_NAME = '灵犀演示';
const KB_SUBDIR = 'kb';
const STORAGE_VERSION = '1.0.0';

/**
 * 解析 KB 根目录。跨平台：
 *   macOS:   $HOME/Library/Application Support/灵犀演示/kb
 *   Windows: %APPDATA%/灵犀演示/kb （process.env.APPDATA 在 CI 兜底）
 *   Linux:   $XDG_DATA_HOME/灵犀演示/kb 或 $HOME/.local/share/灵犀演示/kb
 *
 * 可被 LINGXI_KB_ROOT 环境变量覆盖（测试用）。
 */
export function resolveKbRoot(override?: string): string {
  if (override && override.trim()) {
    return path.resolve(override);
  }
  if (process.env.LINGXI_KB_ROOT && process.env.LINGXI_KB_ROOT.trim()) {
    return path.resolve(process.env.LINGXI_KB_ROOT);
  }
  const platform = process.platform;
  const home = os.homedir();
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DIR_NAME, KB_SUBDIR);
  }
  if (platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, APP_DIR_NAME, KB_SUBDIR);
  }
  // Linux / other: XDG 兜底
  const xdg = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(xdg, APP_DIR_NAME, KB_SUBDIR);
}

/** 测试 / 业务自定义路径下生成 KB 根 */
export function kbPaths(rootOverride?: string) {
  const root = resolveKbRoot(rootOverride);
  return {
    root,
    filesDir: path.join(root, 'files'),
    entriesDir: path.join(root, 'entries'),
    indexPath: path.join(root, 'index.json'),
    manifestPath: path.join(root, 'manifest.json'),
  };
}

// ---- UUID ----

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 生成 RFC 4122 v4 UUID。
 * 优先用 crypto.randomUUID()，不可用时回退到 crypto.randomBytes。
 */
export function uuidv4(): string {
  const c = crypto as unknown as { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** UUID v4 格式校验（轻量、与 jsonschema 的 format=uuid 等价） */
export function isUuidV4(s: string): boolean {
  return typeof s === 'string' && UUID_V4_RE.test(s);
}

// ---- File IO helpers ----

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

/** 原子写：先写 .tmp，再 rename。避免半写状态被读取。 */
async function atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, content, 'utf-8');
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    // 清理 tmp
    try {
      await fs.unlink(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const text = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(text) as T;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    throw err;
  }
}

// ---- Storage class ----

const INDEX_MAX_ITEMS = 200; // 索引最多保留 200 条 id，超出截断

export class KbStorage {
  private readonly paths: ReturnType<typeof kbPaths>;
  private index: KbIndex = { files: [], entries: [] };
  private manifest: KbManifest;
  private dirty = false;
  private manifestDirty = false;
  private flushPromise: Promise<void> | null = null;

  constructor(rootOverride?: string) {
    this.paths = kbPaths(rootOverride);
    this.manifest = {
      version: STORAGE_VERSION,
      created_at: new Date().toISOString(),
      file_count: 0,
      entry_count: 0,
      total_size_bytes: 0,
    };
  }

  /** 初始化目录 + 加载已有索引（幂等，可重复调用） */
  async init(): Promise<void> {
    await ensureDir(this.paths.filesDir);
    await ensureDir(this.paths.entriesDir);

    const idx = await readJSON<KbIndex>(this.paths.indexPath);
    if (idx && Array.isArray(idx.files) && Array.isArray(idx.entries)) {
      this.index = idx;
    }

    const mf = await readJSON<KbManifest>(this.paths.manifestPath);
    if (mf && typeof mf.version === 'string') {
      this.manifest = mf;
    }
  }

  /** KB 根路径（暴露给 UI 展示） */
  get root(): string {
    return this.paths.root;
  }

  // ---- File records ----

  /**
   * 写入一条 file_import 记录（importer 调用）。
   * file_id 若未传则生成新 UUID。
   */
  async putFile(rec: FileImportRecord): Promise<FileImportRecord> {
    if (!isUuidV4(rec.file_id)) {
      throw new Error(`invalid file_id (not UUID v4): ${rec.file_id}`);
    }
    if (!rec.format || !['docx', 'pdf', 'xlsx', 'pptx', 'md', 'jpg', 'png'].includes(rec.format)) {
      throw new Error(`invalid format: ${rec.format}`);
    }
    const fp = path.join(this.paths.filesDir, `${rec.file_id}.json`);
    await atomicWriteJSON(fp, rec);
    this.addToIndex('files', rec.file_id);
    this.bumpManifest({ file_count: this.manifest.file_count + 1, total_size_bytes: this.manifest.total_size_bytes + rec.size_bytes });
    await this.maybeFlush();
    return rec;
  }

  /** 读单条 file_import */
  async getFile(fileId: string): Promise<FileImportRecord | null> {
    if (!isUuidV4(fileId)) return null;
    const fp = path.join(this.paths.filesDir, `${fileId}.json`);
    return readJSON<FileImportRecord>(fp);
  }

  /** 列所有 file_import（按导入时间升序） */
  async listFiles(): Promise<FileImportRecord[]> {
    const ids = this.index.files.slice();
    const out: FileImportRecord[] = [];
    for (const id of ids) {
      const rec = await this.getFile(id);
      if (rec) out.push(rec);
    }
    return out;
  }

  // ---- KB entries ----

  /** 写入一条 wiki 条目（wiki.ts 调用） */
  async putEntry(entry: WikiKbEntry): Promise<WikiKbEntry> {
    if (!isUuidV4(entry.entry_id)) {
      throw new Error(`invalid entry_id (not UUID v4): ${entry.entry_id}`);
    }
    if (entry.summary.length < 50 || entry.summary.length > 1000) {
      throw new Error(`summary length ${entry.summary.length} outside [50, 1000]`);
    }
    if (entry.tags.length < 1 || entry.tags.length > 10) {
      throw new Error(`tags length ${entry.tags.length} outside [1, 10]`);
    }
    const ep = path.join(this.paths.entriesDir, `${entry.entry_id}.json`);
    await atomicWriteJSON(ep, entry);
    this.addToIndex('entries', entry.entry_id);
    this.bumpManifest({ entry_count: this.manifest.entry_count + 1 });
    await this.maybeFlush();
    return entry;
  }

  /** 读单条 wiki 条目 */
  async getEntry(entryId: string): Promise<WikiKbEntry | null> {
    if (!isUuidV4(entryId)) return null;
    const ep = path.join(this.paths.entriesDir, `${entryId}.json`);
    return readJSON<WikiKbEntry>(ep);
  }

  /** 列所有 wiki 条目 */
  async listEntries(): Promise<WikiKbEntry[]> {
    const ids = this.index.entries.slice();
    const out: WikiKbEntry[] = [];
    for (const id of ids) {
      const rec = await this.getEntry(id);
      if (rec) out.push(rec);
    }
    return out;
  }

  // ---- Index / manifest ----

  /** 取当前 manifest（用于 UI 展示统计） */
  getManifest(): KbManifest {
    return { ...this.manifest };
  }

  /** 取索引快照 */
  getIndex(): KbIndex {
    return { files: [...this.index.files], entries: [...this.index.entries] };
  }

  /** 强制 flush（一般测试 / 退出时调用） */
  async flush(): Promise<void> {
    if (this.flushPromise) {
      await this.flushPromise;
    }
    if (this.dirty) {
      this.dirty = false;
      await atomicWriteJSON(this.paths.indexPath, this.index);
    }
    if (this.manifestDirty) {
      this.manifestDirty = false;
      await atomicWriteJSON(this.paths.manifestPath, this.manifest);
    }
  }

  // ---- 内部 ----

  private addToIndex(bucket: 'files' | 'entries', id: string): void {
    const arr = this.index[bucket];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    arr.push(id);
    if (arr.length > INDEX_MAX_ITEMS) {
      arr.splice(0, arr.length - INDEX_MAX_ITEMS);
    }
    this.dirty = true;
  }

  private bumpManifest(patch: Partial<KbManifest>): void {
    this.manifest = { ...this.manifest, ...patch };
    this.manifestDirty = true;
  }

  /** 节流 flush：短时间多次写入合并为一次落盘 */
  private async maybeFlush(): Promise<void> {
    if (this.flushPromise) return;
    this.flushPromise = (async () => {
      await new Promise(r => setTimeout(r, 50));
      this.flushPromise = null;
      await this.flush();
    })();
    await this.flushPromise;
  }
}

// ---- 便捷工厂 ----

/** 单例（按 root 缓存） */
const cache = new Map<string, KbStorage>();

export function getStorage(rootOverride?: string): KbStorage {
  const key = resolveKbRoot(rootOverride);
  let s = cache.get(key);
  if (!s) {
    s = new KbStorage(rootOverride);
    cache.set(key, s);
  }
  return s;
}

/** 清空单例缓存（测试用） */
export function _resetStorageCache(): void {
  cache.clear();
}

// ---- 同步辅助 ----

export function kbRootExists(rootOverride?: string): boolean {
  return existsSync(resolveKbRoot(rootOverride));
}
