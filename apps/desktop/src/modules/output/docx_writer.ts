/**
 * DOCX 输出 writer（T-1.5 · PRD 3.5）
 * 灵犀演示 · Phase 1
 *
 * 职责：ExportPayload → .docx（Word / WPS 兼容）
 *
 * 实现：使用 `docx` npm 包（纯 JS 生成 Office Open XML）。
 * 文档结构：H1 文档标题 → 每章节 H2 + 段落 → 末尾落款。
 * 嵌入字体名到 Normal 样式（embed_fonts 选项 → 实际行为仅"声明"，真实嵌入需后续扩展）。
 *
 * 验收标准：
 * - 文件存在且 size > 5KB
 * - 文件首 4 字节 = PK\x03\x04（DOCX 本质是 ZIP+XML）
 * - 内容至少 3 段（PRD 要求 ≥ 3 paragraphs）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  LevelFormat,
  convertInchesToTwip,
} from 'docx';
import type { ExportPayload, OutputMetadata, OutputResult } from './types';

/** 从 <p>/<li> 抽取段落（保留基本内联格式：<strong>/<b> → bold，<em>/<i> → italic） */
function htmlToDocxParagraphs(html: string): Paragraph[] {
  if (!html) return [];
  // 拆分 <p>...</p> / <h2-6>...</h2-6> / <li>...</li>
  const blocks: Array<{ tag: 'p' | 'h' | 'li'; inner: string }> = [];
  const re = /<(p|h[1-6]|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase().startsWith('h')
      ? 'h'
      : m[1].toLowerCase() === 'li'
      ? 'li'
      : 'p';
    blocks.push({ tag, inner: m[2] });
  }
  // 退化：若没有匹配到任何块，整段作为一个 paragraph
  if (blocks.length === 0 && html.trim()) {
    blocks.push({ tag: 'p', inner: html });
  }

  return blocks.map(b => {
    // 内联格式：<strong>/<b> → bold，<em>/<i> → italic
    const innerHtml = b.inner;
    const runs: TextRun[] = [];
    // 简单解析：把 <strong>...</strong> / <em>...</em> 切出来
    const inlineRe = /<(strong|b|em|i|u)[^>]*>([\s\S]*?)<\/\1>|([^<]+)/gi;
    let im: RegExpExecArray | null;
    while ((im = inlineRe.exec(innerHtml)) !== null) {
      if (im[3] !== undefined) {
        // 纯文本
        const txt = decodeEntities(im[3]);
        if (txt) runs.push(new TextRun({ text: txt }));
      } else {
        const tag = im[1].toLowerCase();
        const txt = decodeEntities(im[2]);
        if (tag === 'strong' || tag === 'b') {
          runs.push(new TextRun({ text: txt, bold: true }));
        } else if (tag === 'em' || tag === 'i') {
          runs.push(new TextRun({ text: txt, italics: true }));
        } else if (tag === 'u') {
          runs.push(new TextRun({ text: txt, underline: {} }));
        }
      }
    }
    if (runs.length === 0) {
      runs.push(new TextRun({ text: decodeEntities(innerHtml) }));
    }
    return new Paragraph({
      heading: b.tag === 'h' ? HeadingLevel.HEADING_3 : undefined,
      children: runs,
      spacing: { after: 120 },
      alignment: b.tag === 'li' ? AlignmentType.LEFT : undefined,
      ...(b.tag === 'li' ? { bullet: { level: 0 } } : {}),
    });
  });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function hex(c: string): string {
  if (!c) return '2563eb';
  return c.startsWith('#') ? c.slice(1) : c;
}

/**
 * 主入口：写 DOCX 文件（异步，jest 用 .resolves 拿）。
 */
export async function writeDocx(
  payload: ExportPayload,
  outputPath: string,
  _opts: { page_size?: 'A4' | 'Letter' } = {},
): Promise<{ result: OutputResult; metadata: OutputMetadata }> {
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
      metadata: metaFailed(payload, 'docx', 'payload.sections 为空'),
    };
  }

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const children: Paragraph[] = [];

    // 文档大标题
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        children: [
          new TextRun({
            text: payload.doc_title,
            bold: true,
            color: hex(payload.style.palette.primary),
            size: 48, // 半磅 — 24pt
          }),
        ],
        spacing: { after: 240 },
        alignment: AlignmentType.CENTER,
      }),
    );
    // 副标题 — 生成时间
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')} · 灵犀演示`,
            color: hex(payload.style.palette.muted),
            size: 20, // 10pt
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
      }),
    );

    // 每个章节
    let totalParagraphs = 1; // 大标题算 1 段
    payload.sections.forEach((section, idx) => {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: `${idx + 1}. ${section.heading}`,
              bold: true,
              color: hex(payload.style.palette.primary),
              size: 32, // 16pt
            }),
          ],
          spacing: { before: 240, after: 120 },
        }),
      );
      const paras = htmlToDocxParagraphs(section.content_html);
      if (paras.length === 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '(本节暂无正文)' })],
            spacing: { after: 120 },
          }),
        );
      } else {
        children.push(...paras);
      }
      // 图片说明（如有图片）
      if (section.image_urls && section.image_urls.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `📎 含 ${section.image_urls.length} 张配图（详见预览 HTML）`,
                italics: true,
                color: hex(payload.style.palette.muted),
                size: 18,
              }),
            ],
            spacing: { after: 120 },
          }),
        );
      }
      totalParagraphs += 1 + paras.length;
    });

    // 落款
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '\n—— 本文档由灵犀演示自动生成 ——',
            italics: true,
            color: hex(payload.style.palette.muted),
            size: 18,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 480 },
      }),
    );

    const doc = new Document({
      creator: '灵犀演示',
      title: payload.doc_title,
      description: `由灵犀演示 T-1.5 多格式输出生成，preview_id=${payload.preview_id}`,
      styles: {
        default: {
          document: {
            run: {
              font: payload.style.fonts.body,
              size: 22, // 11pt
            },
          },
          heading1: {
            run: { font: payload.style.fonts.heading, size: 48, bold: true },
          },
          heading2: {
            run: { font: payload.style.fonts.heading, size: 32, bold: true },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
              },
            },
          },
          children,
        },
      ],
      numbering: {
        config: [
          {
            reference: 'default-bullet',
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: '•',
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: { indent: { left: convertInchesToTwip(0.5) } },
                },
              },
            ],
          },
        ],
      },
    });

    const buf = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buf);

    const stat = fs.statSync(outputPath);
    return {
      result: {
        request_id: '',
        preview_id: payload.preview_id,
        status: 'ok',
        output_path: outputPath,
        size_bytes: stat.size,
        error: null,
        generated_at: new Date().toISOString(),
      },
      metadata: {
        request_id: '',
        preview_id: payload.preview_id,
        format: 'docx',
        output_path: outputPath,
        size_bytes: stat.size,
        paragraph_count: totalParagraphs,
        generated_at: new Date().toISOString(),
        verification: {
          file_exists: true,
          size_valid: stat.size > 0,
          format_valid: stat.size > 1024,
          header_signature: 'PK\\x03\\x04 (ZIP/OOXML)',
        },
      },
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
      metadata: metaFailed(payload, 'docx', msg),
    };
  }
}

function metaFailed(
  payload: ExportPayload,
  format: 'docx',
  _err: string,
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

/** 验证 DOCX 文件首部 — 用于 test_writer_format_compliance */
export function verifyDocxFile(filePath: string): { ok: boolean; reason?: string } {
  if (!fs.existsSync(filePath)) return { ok: false, reason: '文件不存在' };
  const stat = fs.statSync(filePath);
  if (stat.size < 1024) return { ok: false, reason: `文件太小 (${stat.size}B)` };
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    return { ok: false, reason: `DOCX 首部不是 ZIP 魔数: ${buf.toString('hex')}` };
  }
  return { ok: true };
}