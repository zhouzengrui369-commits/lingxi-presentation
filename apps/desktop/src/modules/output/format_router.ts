/**
 * 格式路由（T-1.5 · PRD 3.5）
 * 灵犀演示 · Phase 1
 *
 * 职责：根据 OutputRequest.format 调度对应 writer，输出统一 OutputResult + OutputMetadata。
 * 接 T-1.4 preview 的 HTML（PreviewPage.html）作为输入源，
 * 也接 ExportPayload（CLI / 测试直接构造）。
 *
 * 集成路径：
 *   preview 模块 (T-1.4) → PreviewPage.html + sections + style
 *      ↓
 *   toExportPayload(PreviewPage, style?)
 *      ↓
 *   dispatchExport({...request, sourceHtml, payload}, { router })
 *      ↓
 *   4 种 writer 之一 → OutputResult + OutputMetadata
 */

import * as path from 'node:path';
import { writeHtml, verifyHtmlFile } from './html_writer';
import { writePptxSync, verifyPptxFile } from './pptx_writer';
import { writeDocx, verifyDocxFile } from './docx_writer';
import { writePdf, verifyPdfFile } from './pdf_writer';
import type {
  ExportPayload,
  OutputFormat,
  OutputMetadata,
  OutputRequest,
  OutputResult,
} from './types';
import type { TemplateStyle } from '../preview/types';

/** 路由输入：包含源 HTML + payload + request */
export interface DispatchInput {
  request: OutputRequest;
  /** preview 模块已渲染好的 HTML（HTML writer 直接复用，其它 writer 抽取文本） */
  sourceHtml: string;
  /** 归一化 payload（任何 writer 都接收） */
  payload: ExportPayload;
}

/** 路由输出 */
export interface DispatchOutput {
  result: OutputResult;
  metadata: OutputMetadata;
}

/**
 * 单一入口：根据 format 调度 writer。
 */
export async function dispatchExport(input: DispatchInput): Promise<DispatchOutput> {
  const { request, sourceHtml, payload } = input;
  const fmt: OutputFormat = request.format;

  // 确保 output_path 必填
  if (!request.output_path) {
    return {
      result: fail(request, 'output_path 为空'),
      metadata: metaFailed(payload, fmt, 'output_path 为空'),
    };
  }
  // 确保 sourceHtml 至少 <html>（其它 writer 不直接用，但要保证 HTML writer 能复用）
  if (!sourceHtml || !sourceHtml.trim()) {
    return {
      result: fail(request, 'sourceHtml 为空（preview 模块未传 HTML）'),
      metadata: metaFailed(payload, fmt, 'sourceHtml 为空'),
    };
  }

  switch (fmt) {
    case 'html': {
      const out = writeHtml(sourceHtml, payload, request.output_path);
      return { ...out, result: { ...out.result, request_id: request.request_id } };
    }
    case 'pptx': {
      const out = await writePptxSync(payload, request.output_path, {
        page_size: request.options?.page_size === '4:3' ? '4:3' : '16:9',
      });
      return { ...out, result: { ...out.result, request_id: request.request_id } };
    }
    case 'docx': {
      const out = await writeDocx(payload, request.output_path);
      return { ...out, result: { ...out.result, request_id: request.request_id } };
    }
    case 'pdf': {
      const out = await writePdf(payload, request.output_path, {
        page_size: request.options?.page_size === 'A3' ? 'A3' : 'A4',
      });
      return { ...out, result: { ...out.result, request_id: request.request_id } };
    }
    default: {
      return {
        result: fail(request, `不支持的输出格式: ${fmt}`),
        metadata: metaFailed(payload, fmt, `不支持的输出格式: ${fmt}`),
      };
    }
  }
}

/** 验证输出文件（独立函数，PM 验收用） */
export function verifyOutputFile(
  format: OutputFormat,
  filePath: string,
): { ok: boolean; reason?: string } {
  switch (format) {
    case 'html':
      return verifyHtmlFile(filePath);
    case 'pptx':
      return verifyPptxFile(filePath);
    case 'docx':
      return verifyDocxFile(filePath);
    case 'pdf':
      return verifyPdfFile(filePath);
  }
}

/** PreviewPage → ExportPayload（唯一边界 — 避免 writers 反向耦合 preview） */
export function toExportPayload(
  page: {
    preview_id: string;
    sections: Array<{ heading: string; content_html: string; image_urls: string[] }>;
    html?: string;
  },
  style?: TemplateStyle,
  docTitle?: string,
): ExportPayload {
  const defaultStyle: TemplateStyle = {
    template_id: null,
    theme: 'light',
    palette: {
      primary: '#2563eb',
      secondary: '#0ea5e9',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a',
      muted: '#64748b',
    },
    fonts: {
      heading: '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
      body: '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
    },
    layout: 'simple-business',
  };
  const s = style ?? defaultStyle;
  return {
    doc_title: docTitle ?? page.sections[0]?.heading ?? '未命名文档',
    sections: page.sections,
    style: {
      theme: s.theme,
      palette: s.palette,
      fonts: s.fonts,
    },
    preview_id: page.preview_id,
  };
}

function fail(request: OutputRequest, msg: string): OutputResult {
  return {
    request_id: request.request_id,
    preview_id: request.preview_id,
    status: 'failed',
    output_path: null,
    size_bytes: null,
    error: msg,
    generated_at: new Date().toISOString(),
  };
}

function metaFailed(
  payload: ExportPayload,
  format: OutputFormat,
  err: string,
): OutputMetadata {
  return {
    request_id: '',
    preview_id: payload.preview_id,
    format,
    output_path: '',
    size_bytes: 0,
    generated_at: new Date().toISOString(),
    verification: { file_exists: false, size_valid: false, format_valid: false },
  };
}

/** 生成默认输出路径（同目录下，按格式切后缀） */
export function defaultOutputPath(
  previewId: string,
  format: OutputFormat,
  dir: string,
): string {
  return path.join(dir, `preview-${previewId}.${format}`);
}