/**
 * File KB Module — T-1.1
 *
 * 公共 API 入口（业务代码 + UI 都从这个文件导入）。
 * 包含：
 *   - FileKbManager：高层 API（import + organize + list），UI/CLI 都用它
 *   - 重新导出 schema 类型 + 工具
 *   - 不含 React Native UI（UI 在 FileKBScreen.tsx；本模块保持平台无关）
 *
 * 灵犀演示 · Phase 1 · T-1.1
 */

import { KbStorage, kbRootExists, resolveKbRoot } from './storage.ts';
import type { WikiKbEntry, FileImportRecord } from './storage.ts';
import { importFile, SUPPORTED_FORMATS, detectFormat } from './importer.ts';
import type { ImportResult, SupportedFormat } from './importer.ts';
import { organizeToWiki } from './wiki.ts';
import type { WikiOptions } from './wiki.ts';
import { linkKb, tokenize, toSuggestions, suggestRelatedFiles } from './kb_linker.ts';
import type { KbLinkResult, Suggestion } from './kb_linker.ts';

export interface ImportOptions {
  /** daemon base URL（默认从 LINGXI_DAEMON_URL / LINGXI_DAEMON_PORT / 兜底端口读） */
  daemonUrl?: string;
  /** daemon 超时（毫秒） */
  daemonTimeoutMs?: number;
  /** 强制走本地启发式 wiki（daemon 不可达时自动兜底） */
  forceLocalWiki?: boolean;
  /** 进度回调（每文件一次） */
  onProgress?: (stage: ImportStage, payload: Record<string, unknown>) => void;
  /** 自定义 HTTP fetch（测试用） */
  fetchImpl?: typeof fetch;
}

export type ImportStage =
  | 'scan'           // 扫到文件
  | 'parsing'        // importer 解析中
  | 'parsed'         // importer 完成
  | 'wiki_calling'   // 调 daemon 中
  | 'wiki_done'      // wiki 完成
  | 'persisted'      // storage 写入完成
  | 'failed';        // 任意阶段失败

export interface BatchResult {
  files: FileImportRecord[];
  entries: WikiKbEntry[];
  failed: Array<{ path: string; error: string }>;
  started_at: string;
  finished_at: string;
}

/**
 * 高层 API：导入一批文件（单文件 / 文件夹都行）+ 自动 wiki 整理。
 *
 * 用法：
 * ```ts
 * const mgr = new FileKbManager();
 * await mgr.init();
 * const res = await mgr.importPaths(['./Q1.docx', './notes.pdf']);
 * console.log(res.entries);
 * ```
 */
export class FileKbManager {
  private storage: KbStorage;
  private wikiOpts: WikiOptions;

  constructor(opts: { kbRoot?: string; wikiOpts?: WikiOptions } = {}) {
    this.storage = new KbStorage(opts.kbRoot);
    this.wikiOpts = opts.wikiOpts ?? {};
  }

  async init(): Promise<void> {
    await this.storage.init();
  }

  /** 暴露 storage 给 advisor (T-1.2) 调 kb_linker 用 */
  getStorage(): KbStorage {
    return this.storage;
  }

  /** KB 根路径（UI 显示「数据存在哪」） */
  get kbRoot(): string {
    return this.storage.root;
  }

  /**
   * 导入一批路径（文件或文件夹）。文件夹递归扫子文件。
   * 已存在的 file_id（按 path）会跳过。
   */
  async importPaths(paths: string[], opts: ImportOptions = {}): Promise<BatchResult> {
    const started_at = new Date().toISOString();
    const expanded = await expandPaths(paths);
    const files: FileImportRecord[] = [];
    const entries: WikiKbEntry[] = [];
    const failed: BatchResult['failed'] = [];

    for (const p of expanded) {
      opts.onProgress?.('scan', { path: p });
      try {
        // 检查是否已 import（按 path）
        const existing = await this.findFileByPath(p);
        if (existing) {
          files.push(existing);
          opts.onProgress?.('parsed', { path: p, file_id: existing.file_id, skipped: true });
          continue;
        }

        opts.onProgress?.('parsing', { path: p });
        const ir: ImportResult = await importFile(p);
        files.push(ir.record);

        if (ir.record.status === 'failed') {
          failed.push({ path: p, error: ir.record.error ?? 'unknown' });
          opts.onProgress?.('failed', { path: p, reason: 'parse_failed' });
          continue;
        }

        await this.storage.putFile(ir.record);
        opts.onProgress?.('parsed', { path: p, file_id: ir.record.file_id });

        opts.onProgress?.('wiki_calling', { file_id: ir.record.file_id });
        const entry = await organizeToWiki(ir, {
          ...this.wikiOpts,
          ...opts,
        });
        await this.storage.putEntry(entry);
        entries.push(entry);
        opts.onProgress?.('persisted', {
          file_id: ir.record.file_id,
          entry_id: entry.entry_id,
          title: entry.title,
        });
      } catch (err) {
        const msg = (err as Error).message;
        failed.push({ path: p, error: msg });
        opts.onProgress?.('failed', { path: p, error: msg });
      }
    }

    return {
      files,
      entries,
      failed,
      started_at,
      finished_at: new Date().toISOString(),
    };
  }

  private async findFileByPath(p: string): Promise<FileImportRecord | null> {
    const all = await this.storage.listFiles();
    return all.find(r => r.path === p) ?? null;
  }
}

// ---- 路径展开 ----

/** 把单个文件 / 文件夹路径展开成所有文件路径（递归文件夹） */
export async function expandPaths(paths: string[]): Promise<string[]> {
  const { promises: fs } = await import('fs');
  const out: string[] = [];
  for (const p of paths) {
    const stat = await fs.stat(p).catch(() => null);
    if (!stat) continue;
    if (stat.isFile()) {
      if (detectFormat(p)) out.push(p);
    } else if (stat.isDirectory()) {
      const entries = await fs.readdir(p, { withFileTypes: true });
      for (const e of entries) {
        const sub = `${p}/${e.name}`;
        if (e.isDirectory()) {
          const subFiles = await expandPaths([sub]);
          out.push(...subFiles);
        } else if (e.isFile() && detectFormat(e.name)) {
          out.push(sub);
        }
      }
    }
  }
  return out;
}

// ---- 公共 API re-exports ----

export {
  KbStorage,
  kbRootExists,
  resolveKbRoot,
  // importer
  importFile as importSingleFile,
  SUPPORTED_FORMATS,
  detectFormat,
  // wiki
  organizeToWiki,
  // kb_linker
  linkKb,
  tokenize,
  toSuggestions,
  suggestRelatedFiles,
};

// ---- type-only re-exports ----

export type {
  WikiKbEntry,
  FileImportRecord,
  ImportResult,
  SupportedFormat,
  WikiOptions,
  KbLinkResult,
  KbLinkOptions,
  Suggestion,
  ImportOptions,
  BatchResult,
  ImportStage,
};

/** 模块版本号（PM/下游模块做兼容性校验） */
export const FILE_KB_MODULE_VERSION = '1.0.0';

/** 默认导出：FileKbManager（CLI 风格入口也用这个） */
export default FileKbManager;
