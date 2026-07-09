/**
 * 实时保存（T-1.4 · PRD 3.4）
 * 灵犀演示 · Phase 1
 *
 * 职责：每 5s 自动把当前预览页落盘到本地（用户关 app 不丢），并支持关-重开状态恢复。
 *   - 落盘目录（PRD 9.3）：
 *       macOS  ~/Library/Application Support/灵犀演示/previews/
 *       Windows %APPDATA%/灵犀演示/previews/
 *   - 存储后端抽象为 PreviewStore 接口：
 *       * 测试 / CLI / Node 环境 → fs_store.ts 的 createFsStore（真实落盘）
 *       * RN 运行时 → 由 index.tsx 注入 RN 兼容实现（如 react-native-fs）
 *
 * 本文件保持 **RN-safe**（无 node 内建依赖），node fs 逻辑放 fs_store.ts。
 */
import type { PreviewPage, SaveState } from './types';

/** PRD 硬指标：每 5s 落盘 */
export const SAVE_INTERVAL_MS = 5000;

/** 存储后端抽象（可注入，便于测试与跨平台） */
export interface PreviewStore {
  /** 落盘一个预览页（覆盖同 preview_id） */
  save(page: PreviewPage): void;
  /** 按 preview_id 读回（无则 null） */
  load(previewId: string): PreviewPage | null;
  /** 列出所有已保存的 preview_id */
  list(): string[];
  /** 最近修改的预览页（用于关-重开恢复），无则 null */
  latest(): PreviewPage | null;
}

/** 依赖注入：时钟 + 定时器（默认取全局，测试可 mock / 用 fake timers） */
export interface AutosaveDeps {
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => any;
  clearIntervalFn?: (handle: any) => void;
}

export interface AutosaveOptions extends AutosaveDeps {
  store: PreviewStore;
  intervalMs?: number;
  /** 每次成功保存后的回调（UI 更新指示器） */
  onSaved?: (state: SaveState) => void;
  /** 保存出错回调 */
  onError?: (err: unknown) => void;
}

/**
 * 自动保存控制器。
 *
 * 用法：
 *   const auto = new Autosave({ store });
 *   auto.start(() => currentPage);   // 每 5s tick，dirty 才落盘
 *   auto.markDirty();                // 编辑发生时调用
 *   auto.saveNow();                  // 手动立即保存
 *   auto.stop();                     // 卸载时停止
 */
export class Autosave {
  private store: PreviewStore;
  private intervalMs: number;
  private now: () => number;
  private setIntervalFn: (fn: () => void, ms: number) => any;
  private clearIntervalFn: (handle: any) => void;
  private onSaved?: (state: SaveState) => void;
  private onError?: (err: unknown) => void;

  private handle: any = null;
  private getPage: (() => PreviewPage | null) | null = null;
  private state: SaveState = { lastSavedAt: null, dirty: false };

  constructor(opts: AutosaveOptions) {
    this.store = opts.store;
    this.intervalMs = opts.intervalMs ?? SAVE_INTERVAL_MS;
    this.now = opts.now ?? (() => Date.now());
    this.setIntervalFn =
      opts.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn =
      opts.clearIntervalFn ?? ((h) => clearInterval(h));
    this.onSaved = opts.onSaved;
    this.onError = opts.onError;
  }

  /** 启动周期保存。getPage 返回 null 时该 tick 跳过。 */
  start(getPage: () => PreviewPage | null): void {
    this.getPage = getPage;
    if (this.handle != null) return; // 幂等
    this.handle = this.setIntervalFn(() => this.tick(), this.intervalMs);
  }

  /** 停止周期保存（不自动 flush，需要时先 saveNow） */
  stop(): void {
    if (this.handle != null) {
      this.clearIntervalFn(this.handle);
      this.handle = null;
    }
  }

  /** 标记有未保存改动（编辑时调用） */
  markDirty(): void {
    this.state = { ...this.state, dirty: true };
  }

  /** 周期 tick：dirty 且有 page 才落盘 */
  private tick(): void {
    if (!this.state.dirty || !this.getPage) return;
    const page = this.getPage();
    if (!page) return;
    this.persist(page);
  }

  /** 立即保存（无条件，若有 page） */
  saveNow(page?: PreviewPage): boolean {
    const target = page ?? (this.getPage ? this.getPage() : null);
    if (!target) return false;
    return this.persist(target);
  }

  private persist(page: PreviewPage): boolean {
    try {
      this.store.save(page);
      this.state = { lastSavedAt: this.now(), dirty: false };
      this.onSaved?.(this.state);
      return true;
    } catch (err) {
      this.onError?.(err);
      return false;
    }
  }

  /** 当前保存状态 */
  getState(): SaveState {
    return { ...this.state };
  }

  /** 恢复：读回最近保存的预览页（关-重开场景） */
  recover(): PreviewPage | null {
    const page = this.store.latest();
    if (page) {
      this.state = { lastSavedAt: this.now(), dirty: false };
    }
    return page;
  }
}

/**
 * 生成保存指示器文案（"已保存 3s 前"）。
 * @param state 当前保存状态
 * @param nowMs 当前时间 ms（默认 Date.now）
 */
export function getStatusText(state: SaveState, nowMs: number = Date.now()): string {
  if (state.lastSavedAt == null) {
    return state.dirty ? '未保存' : '尚未保存';
  }
  const diffSec = Math.max(0, Math.round((nowMs - state.lastSavedAt) / 1000));
  const base =
    diffSec < 2 ? '已保存 · 刚刚' : `已保存 · ${diffSec}s 前`;
  return state.dirty ? `${base}（有改动待保存）` : base;
}
