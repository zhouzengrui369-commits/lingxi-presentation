/**
 * 轻量编辑器（T-1.4 · PRD 3.4）
 * 灵犀演示 · Phase 1
 *
 * 职责：轻量编辑（文字 / 段落 / 顺序），不回 AI —— 直接在 preview 结构上做不可变更新。
 *   - 改文字：更新章节 heading / content_html
 *   - 段落顺序：section 上移 / 下移 / 任意 reorder
 *   - 节流防抖：contenteditable 高频输入 → 合并触发 autosave（避免每键落盘）
 *
 * 所有结构操作为**纯函数 + 不可变**（返回新对象），便于单测与撤销。
 */
import type { PreviewPage, PreviewSection } from './types';

/** 深拷贝一个 section（避免共享引用） */
function cloneSection(s: PreviewSection): PreviewSection {
  return {
    heading: s.heading,
    content_html: s.content_html,
    image_urls: [...s.image_urls],
  };
}

/** 浅克隆 page 并替换 sections（其余字段保留） */
function withSections(page: PreviewPage, sections: PreviewSection[]): PreviewPage {
  return { ...page, sections };
}

/**
 * 轻量文字编辑：更新指定章节的 heading 和/或 content_html。
 * @throws 越界索引 / 空 patch
 */
export function applyTextChange(
  page: PreviewPage,
  sectionIndex: number,
  patch: { heading?: string; content_html?: string },
): PreviewPage {
  if (sectionIndex < 0 || sectionIndex >= page.sections.length) {
    throw new RangeError(`applyTextChange: sectionIndex ${sectionIndex} 越界`);
  }
  if (patch.heading === undefined && patch.content_html === undefined) {
    throw new Error('applyTextChange: patch 至少含 heading 或 content_html');
  }
  const sections = page.sections.map((s, i) => {
    if (i !== sectionIndex) return s;
    const next = cloneSection(s);
    if (patch.heading !== undefined) next.heading = patch.heading;
    if (patch.content_html !== undefined) next.content_html = patch.content_html;
    return next;
  });
  return withSections(page, sections);
}

/**
 * 段落顺序调整：把 fromIndex 的章节移动到 toIndex 位置。
 * @throws 越界索引
 */
export function reorderSection(
  page: PreviewPage,
  fromIndex: number,
  toIndex: number,
): PreviewPage {
  const n = page.sections.length;
  if (fromIndex < 0 || fromIndex >= n) {
    throw new RangeError(`reorderSection: fromIndex ${fromIndex} 越界`);
  }
  if (toIndex < 0 || toIndex >= n) {
    throw new RangeError(`reorderSection: toIndex ${toIndex} 越界`);
  }
  if (fromIndex === toIndex) return page;
  const sections = page.sections.map(cloneSection);
  const [moved] = sections.splice(fromIndex, 1);
  sections.splice(toIndex, 0, moved);
  return withSections(page, sections);
}

/** 章节上移一位（顶部则不动） */
export function moveSectionUp(page: PreviewPage, index: number): PreviewPage {
  if (index <= 0) return page;
  return reorderSection(page, index, index - 1);
}

/** 章节下移一位（底部则不动） */
export function moveSectionDown(page: PreviewPage, index: number): PreviewPage {
  if (index >= page.sections.length - 1) return page;
  return reorderSection(page, index, index + 1);
}

/** 删除一个章节（保证至少保留 1 个，符合 schema minItems:1） */
export function removeSection(page: PreviewPage, index: number): PreviewPage {
  if (page.sections.length <= 1) {
    throw new Error('removeSection: 至少保留 1 个章节（schema minItems:1）');
  }
  if (index < 0 || index >= page.sections.length) {
    throw new RangeError(`removeSection: index ${index} 越界`);
  }
  const sections = page.sections.filter((_, i) => i !== index).map(cloneSection);
  return withSections(page, sections);
}

/**
 * 防抖器：连续调用只在最后一次触发后 delay ms 执行一次。
 * 用于 contenteditable 高频输入 → 合并落盘。
 */
export function createDebouncer<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): { call: (...args: A) => void; flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    call(...args: A) {
      lastArgs = args;
      clear();
      timer = setTimeout(() => {
        timer = null;
        if (lastArgs) fn(...lastArgs);
      }, delayMs);
    },
    flush() {
      clear();
      if (lastArgs) fn(...lastArgs);
    },
    cancel() {
      clear();
      lastArgs = null;
    },
  };
}

/**
 * 节流器：intervalMs 内最多触发一次（首次立即，其后等冷却）。
 * 用于编辑过程中周期性同步预览。
 */
export function createThrottle<A extends unknown[]>(
  fn: (...args: A) => void,
  intervalMs: number,
): (...args: A) => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: A | null = null;
  return (...args: A) => {
    const now = Date.now();
    const remaining = intervalMs - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else {
      pendingArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          if (pendingArgs) fn(...pendingArgs);
        }, remaining);
      }
    }
  };
}

/**
 * 从 contenteditable DOM 变更事件里解析出结构化 patch。
 * WebView 内 JS 侧调用，把 [data-section-index] + [data-field] → applyTextChange 参数。
 * （纯解析，无 DOM 依赖，接收已抽取的原始值，便于测试）
 */
export function parseEditableChange(raw: {
  sectionIndex: number;
  field: 'heading' | 'content';
  value: string;
}): { sectionIndex: number; patch: { heading?: string; content_html?: string } } {
  const patch =
    raw.field === 'heading'
      ? { heading: raw.value }
      : { content_html: raw.value };
  return { sectionIndex: raw.sectionIndex, patch };
}
