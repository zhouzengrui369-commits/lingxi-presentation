/**
 * Node 文件系统存储后端（T-1.4 autosave 的落盘实现）
 * 灵犀演示 · Phase 1
 *
 * 仅在 Node 环境使用（测试 / CLI / 未来经注入给 RN 的桥接层）。
 * RN 运行时**不导入本文件**，以免 metro 打包 node 内建模块。
 *
 * 落盘目录（PRD 9.3）：
 *   macOS   ~/Library/Application Support/灵犀演示/previews/
 *   Windows %APPDATA%/灵犀演示/previews/
 *   其他    ~/.lingxi/previews/
 * 可用环境变量 LINGXI_PREVIEWS_DIR 覆盖（测试 / CLI 用）。
 */
import type { PreviewPage } from './types';
import type { PreviewStore } from './autosave';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** 解析预览落盘目录（按平台 + 环境变量覆盖） */
export function resolvePreviewsDir(): string {
  const override = process.env.LINGXI_PREVIEWS_DIR;
  if (override && override.trim()) return override;
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', '灵犀演示', 'previews');
    case 'win32':
      return path.join(process.env.APPDATA || home, '灵犀演示', 'previews');
    default:
      return path.join(home, '.lingxi', 'previews');
  }
}

/** 创建基于 node fs 的 PreviewStore（原子写：tmp + rename） */
export function createFsStore(dir: string = resolvePreviewsDir()): PreviewStore {
  fs.mkdirSync(dir, { recursive: true });

  const fileOf = (previewId: string): string => {
    // preview_id 是 UUID，无路径分隔符；再兜底 sanitize 一次
    const safe = previewId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(dir, `${safe}.json`);
  };

  return {
    save(page: PreviewPage): void {
      const target = fileOf(page.preview_id);
      const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(page, null, 2), 'utf8');
      fs.renameSync(tmp, target); // 原子替换，避免半写文件
    },

    load(previewId: string): PreviewPage | null {
      const target = fileOf(previewId);
      if (!fs.existsSync(target)) return null;
      try {
        return JSON.parse(fs.readFileSync(target, 'utf8')) as PreviewPage;
      } catch {
        return null;
      }
    },

    list(): string[] {
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => f.replace(/\.json$/, ''));
    },

    latest(): PreviewPage | null {
      if (!fs.existsSync(dir)) return null;
      const files = fs
        .readdirSync(dir)
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => {
          const full = path.join(dir, f);
          return { full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
      if (files.length === 0) return null;
      try {
        return JSON.parse(fs.readFileSync(files[0].full, 'utf8')) as PreviewPage;
      } catch {
        return null;
      }
    },
  };
}
