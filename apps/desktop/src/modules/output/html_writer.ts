/**
 * HTML 输出 writer（T-1.5 · PRD 3.5）
 * 灵犀演示 · Phase 1
 *
 * 职责：把 ExportPayload + 现有 PreviewPage.html 合并为可独立打开的 .html 文件。
 *
 * 设计：HTML 是"零成本"格式 — preview 模块已经渲染好了完整 HTML，
 *      html_writer 只做"内联 CSS 校验 + 元数据注入 + 写出"。
 *
 * 验收标准（test_writer_format_compliance 必查）：
 * - 文件存在
 * - size > 0
 * - 文件首部含 <!DOCTYPE html> 或 <html
 * - 至少含 1 个章节（<section class="lx-section"...>）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExportPayload, OutputMetadata, OutputResult } from './types';

/**
 * 把样式 JSON 转成 inline <style>...</style> 块（用于 html 单独打开时的兜底渲染）。
 * 实际 preview HTML 已含 <style>，这里仅做元数据注入。
 */
function injectMetadata(html: string, payload: ExportPayload, meta: OutputMetadata): string {
  const metaJson = JSON.stringify(
    {
      preview_id: payload.preview_id,
      doc_title: payload.doc_title,
      generated_at: meta.generated_at,
      format: 'html',
      sections: payload.sections.length,
    },
    null,
    2,
  );
  // 在 </head> 之前注入 <meta name="lingxi-meta"> + <script type="application/ld+json">
  const metaTag = `  <meta name="lingxi-meta" content="${metaJson.replace(/"/g, '&quot;')}" />\n`;
  const ldJsonScript = `  <script type="application/ld+json">\n${metaJson}\n  </script>\n`;
  const injection = metaTag + ldJsonScript;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${injection}</head>`);
  }
  // fallback: 在 <html> 后插入
  return html.replace(/<html[^>]*>/, m => `${m}\n<head>${injection}</head>`);
}

/**
 * 主入口：写 HTML 文件。
 *
 * @param sourceHtml preview 模块已渲染好的完整 HTML 字符串（来自 PreviewPage.html）
 * @param payload 输出 payload（含章节、样式、preview_id）
 * @param outputPath 绝对输出路径（.html）
 * @returns OutputResult + 元数据
 */
export function writeHtml(
  sourceHtml: string,
  payload: ExportPayload,
  outputPath: string,
): { result: OutputResult; metadata: OutputMetadata } {
  if (!sourceHtml || !sourceHtml.trim()) {
    return {
      result: {
        request_id: '',
        preview_id: payload.preview_id,
        status: 'failed',
        output_path: null,
        size_bytes: null,
        error: 'source HTML 为空',
        generated_at: new Date().toISOString(),
      },
      metadata: metaFailed(payload, 'html', 'source HTML 为空'),
    };
  }

  if (!payload.sections || payload.sections.length < 1) {
    return {
      result: {
        request_id: '',
        preview_id: payload.preview_id,
        status: 'failed',
        output_path: null,
        size_bytes: null,
        error: 'payload.sections 为空',
        generated_at: new Date().toISOString(),
      },
      metadata: metaFailed(payload, 'html', 'payload.sections 为空'),
    };
  }

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const meta: OutputMetadata = {
      request_id: '',
      preview_id: payload.preview_id,
      format: 'html',
      output_path: outputPath,
      size_bytes: 0, // 写后再回填
      page_count: payload.sections.length,
      paragraph_count: countParagraphs(payload),
      generated_at: new Date().toISOString(),
      verification: { file_exists: false, size_valid: false, format_valid: false },
    };
    const out = injectMetadata(sourceHtml, payload, meta);
    fs.writeFileSync(outputPath, out, 'utf8');

    const stat = fs.statSync(outputPath);
    meta.size_bytes = stat.size;
    meta.verification = {
      file_exists: true,
      size_valid: stat.size > 0,
      format_valid: /^<!DOCTYPE\s+html|^<html/i.test(out.trim()),
      header_signature: out.slice(0, 32).replace(/\s+/g, ' '),
    };

    return {
      result: {
        request_id: meta.request_id,
        preview_id: payload.preview_id,
        status: 'ok',
        output_path: outputPath,
        size_bytes: stat.size,
        error: null,
        generated_at: meta.generated_at,
      },
      metadata: meta,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      result: {
        request_id: '',
        preview_id: payload.preview_id,
        status: 'failed',
        output_path: null,
        size_bytes: null,
        error: msg,
        generated_at: new Date().toISOString(),
      },
      metadata: metaFailed(payload, 'html', msg),
    };
  }
}

/** 计算 <p> 段落数（HTML 兼容 — pptx/docx 引用此基准） */
function countParagraphs(payload: ExportPayload): number {
  let total = 0;
  for (const s of payload.sections) {
    // 简单估算：每章节至少 1 段（heading） + content_html 里 <p> 数
    const pMatches = s.content_html.match(/<p[\s>]/gi);
    total += 1 + (pMatches ? pMatches.length : 0);
  }
  return total;
}

function metaFailed(payload: ExportPayload, format: 'html', err: string): OutputMetadata {
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

/** 验证文件首部 — 用于 test_writer_format_compliance */
export function verifyHtmlFile(filePath: string): { ok: boolean; reason?: string } {
  if (!fs.existsSync(filePath)) return { ok: false, reason: '文件不存在' };
  const stat = fs.statSync(filePath);
  if (stat.size === 0) return { ok: false, reason: '文件大小为 0' };
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(Math.min(stat.size, 512));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const head = buf.toString('utf8').trim();
  if (!/^<!DOCTYPE\s+html|^<html/i.test(head)) {
    return { ok: false, reason: `文件首部不是 HTML: "${head.slice(0, 40)}..."` };
  }
  return { ok: true };
}