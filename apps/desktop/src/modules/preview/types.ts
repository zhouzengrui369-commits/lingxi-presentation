/**
 * 预览模块共享类型（T-1.4 HTML 预览与编辑）
 * 灵犀演示 · Phase 1 · PRD 3.4
 *
 * 严格对齐 contracts/preview_page.schema.json。
 * 本文件只含类型声明（无运行时代码），因此可被 `import type` 完全擦除 —
 * renderer.ts 才能在 Node 原生 strip-types 下被 CLI 直接复用（无运行时相对依赖）。
 */

/** 预览页单个章节，对齐 preview_page.schema.json#/properties/sections/items */
export interface PreviewSection {
  /** 章节标题（1-200 字） */
  heading: string;
  /** 章节正文 HTML（不含外层 <section>，由 renderer 包裹） */
  content_html: string;
  /** 章节内图片 URL（file:// 或 https://） */
  image_urls: string[];
}

/** 预览页结构，对齐 preview_page.schema.json */
export interface PreviewPage {
  /** 预览页 UUID v4 */
  preview_id: string;
  /** 完整 HTML 字符串（<!DOCTYPE html>...</html>） */
  html: string;
  /** 模板 ID，null=无模板（用内置简约商务主题） */
  template_id: string | null;
  /** 引用到的 KB 条目 ID（外键 → wiki_kb.entry_id） */
  kb_entry_ids: string[];
  /** 结构化章节列表（≥1，用于轻量编辑/重做时定位） */
  sections: PreviewSection[];
  /** 生成时间 ISO 8601 */
  generated_at: string;
  /** 生成耗时毫秒，PRD 硬指标 ≤ 10000ms */
  latency_ms: number;
}

/**
 * 模板风格 JSON（来自 T-1.3 template 模块的分析产物）。
 * T-1.3 尚未 merge — 本任务先用 DEFAULT_TEMPLATE_STYLE 兜底默认主题，
 * 待 T-1.3 落地后由 PM 在 Phase 1 Gate 串行集成时对接真实字段。
 */
export interface TemplateStyle {
  /** 模板 ID，null=内置主题 */
  template_id: string | null;
  /** 主题明暗 */
  theme: 'light' | 'dark';
  /** 配色（主色/辅色/背景/正文/标题） */
  palette: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
  };
  /** 字体 */
  fonts: {
    heading: string;
    body: string;
  };
  /** 版式提示（可选，T-1.3 提取的版式类型） */
  layout?: string;
}

/** 保存状态（autosave 指示器用） */
export interface SaveState {
  /** 最近一次成功落盘时间戳（ms epoch），null=从未保存 */
  lastSavedAt: number | null;
  /** 是否有未保存的改动 */
  dirty: boolean;
}
