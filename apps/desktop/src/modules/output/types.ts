/**
 * 多格式输出模块 — 共享类型（T-1.5 · PRD 3.5）
 * 灵犀演示 · Phase 1
 *
 * 严格对齐 contracts/output_request.schema.json + output_result.schema.json。
 *
 * 设计约束：本文件只含类型声明（无运行时代码），
 *          可被 `import type` 完全擦除 — CLI 与各 writer 在 Node strip-types 下
 *          可直接复用，无运行时相对依赖。
 */

/** 4 种输出格式（PRD 3.5 限定） */
export type OutputFormat = 'pptx' | 'pdf' | 'docx' | 'html';

/** 输出请求 — 对齐 output_request.schema.json */
export interface OutputRequest {
  /** 输出请求 UUID v4 */
  request_id: string;
  /** 基于哪个预览生成（外键 → preview_page.preview_id） */
  preview_id: string;
  /** 输出格式（4 选 1） */
  format: OutputFormat;
  /** 绝对输出路径（macOS / Win 自适配） */
  output_path: string;
  /** 格式相关选项（可选） */
  options?: {
    page_size?: 'A4' | 'A3' | 'Letter' | '16:9' | '4:3';
    embed_fonts?: boolean;
    include_toc?: boolean;
  } | null;
}

/** 输出结果 — 对齐 output_result.schema.json */
export interface OutputResult {
  request_id: string;
  status: 'ok' | 'failed';
  output_path: string | null;
  size_bytes: number | null;
  error: string | null;
  generated_at: string;
}

/** 输出文件元数据 — 对齐 apps/desktop/src/contracts/output_metadata.schema.json */
export interface OutputMetadata {
  request_id: string;
  preview_id: string;
  format: OutputFormat;
  output_path: string;
  size_bytes: number;
  page_count?: number;
  paragraph_count?: number;
  generated_at: string;
  /** 文件 header 验证摘要 — 用于验收时的真实性检查 */
  verification: {
    file_exists: boolean;
    size_valid: boolean;
    format_valid: boolean;
    header_signature?: string;
  };
}

/**
 * 内部表示：从 PreviewPage 抽取出来的"已归一化"输出 payload。
 * writers 只接收这个结构，不直接接 PreviewPage，避免 writers 反向耦合 preview 模块。
 *
 * - sections: 章节列表（heading / content_html / image_urls）
 * - doc_title: 文档标题
 * - style: 模板风格（颜色 / 字体，HTML/PDF 共用，pptx/docx 用有限子集）
 */
export interface ExportPayload {
  /** 文档大标题（来自预览页 docTitle 或首章节 heading） */
  doc_title: string;
  /** 章节列表（≥ 1） */
  sections: Array<{
    heading: string;
    content_html: string;
    image_urls: string[];
  }>;
  /** 模板风格 — 默认内置简约商务浅色 */
  style: {
    theme: 'light' | 'dark';
    palette: {
      primary: string;
      secondary: string;
      background: string;
      surface: string;
      text: string;
      muted: string;
    };
    fonts: {
      heading: string;
      body: string;
    };
  };
  /** 预览 ID（用于元数据追溯） */
  preview_id: string;
}