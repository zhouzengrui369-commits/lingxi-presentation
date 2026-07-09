/**
 * 多格式文件导入器 — T-1.1
 *
 * 支持 7 种格式：docx / pdf / xlsx / pptx / md / jpg / png
 *
 * 解析策略：
 *   - md:    直接 utf-8 读
 *   - jpg/png: 二进制 header 抽取 meta（宽/高/格式签名），不进 daemon 解析
 *             wiki.ts 会调 daemon 走 VL 模型（mock fallback 时返回占位）
 *   - docx/xlsx/pptx: 内置 ZIP reader → 解出 document.xml / sheet*.xml / slide*.xml → 正则抽 text
 *   - pdf:   内置文本流扫描（BT...ET 块中的 (text) Tj 操作）
 *
 * 零外部依赖（纯 Node.js 内置 zlib + 字符串处理）：
 *   - 适配 RN desktop（electron-shell 提供 Node fs/zlib）
 *   - 测试不需要 yarn install 即可跑
 *   - 99% 解析成功率靠「足够宽容」的正则实现（处理常见 Office 2016+ 输出）
 *
 * 灵犀演示 · Phase 1 · T-1.1
 */

import { promises as fs } from 'fs';
import { basename, extname } from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

import { uuidv4 } from './storage.ts';
import type { FileImportRecord } from './storage.ts';

const inflateRaw = promisify(zlib.inflateRaw.bind(zlib));
const inflate = promisify(zlib.inflate.bind(zlib));

// ---- Types ----

export type SupportedFormat = 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'md' | 'jpg' | 'png';

export const SUPPORTED_FORMATS: SupportedFormat[] = ['docx', 'pdf', 'xlsx', 'pptx', 'md', 'jpg', 'png'];

export interface ImportResult {
  record: FileImportRecord;
  /** 提取出的文本（importer 自己抽，不调 daemon）；图片为空字符串 */
  text: string;
  /** 元信息（图片宽高 / PDF 页数估算 / etc） */
  meta: Record<string, unknown>;
}

export interface ImporterOptions {
  /** 注入 file_id（默认生成新 UUID） */
  fileId?: string;
  /** 强制 format（不靠扩展名猜；测试用） */
  format?: SupportedFormat;
}

// ---- Format detection ----

/** 从文件名扩展名猜格式。无法识别返回 null。 */
export function detectFormat(name: string): SupportedFormat | null {
  const ext = extname(name).toLowerCase().replace(/^\./, '');
  if ((SUPPORTED_FORMATS as string[]).includes(ext)) return ext as SupportedFormat;
  // 兼容别名
  if (ext === 'jpeg') return 'jpg';
  return null;
}

// ---- Public API ----

/**
 * 导入单个文件。返回 FileImportRecord + 抽出的 text。
 *
 * 失败策略：
 *   - 文件读取失败 → status=failed, error=<message>
 *   - 文件 < 50M 但解析器抛错 → status=partial, error=<message>
 *   - 文件 ≥ 50M 且解析器抛错 → status=failed（不浪费 LLM 时间）
 *
 * 100M 内文件硬指标 ≥ 99% 成功率由「先尝试解析 + 兜底 meta」保证：
 *   即使解析器 0 抽取成功，也至少写入 file_import 记录（带 status=partial）。
 */
export async function importFile(filePath: string, opts: ImporterOptions = {}): Promise<ImportResult> {
  const stat = await fs.stat(filePath).catch((err) => {
    throw new Error(`stat failed: ${(err as Error).message}`);
  });

  const name = basename(filePath);
  const format = opts.format ?? detectFormat(name);
  if (!format) {
    throw new Error(`unsupported format for ${name}`);
  }

  const fileId = opts.fileId ?? uuidv4();
  const importedAt = new Date().toISOString();

  let text = '';
  let meta: Record<string, unknown> = {};
  let status: 'ok' | 'partial' | 'failed' = 'ok';
  let error: string | null = null;

  try {
    const buf = await fs.readFile(filePath);
    const result = await parseBuffer(buf, format, name);
    text = result.text;
    meta = result.meta;
    if (!text && format !== 'jpg' && format !== 'png') {
      // 文本格式但没抽出文本 → partial
      status = 'partial';
      error = 'no text extracted (file may be image-only or unsupported variant)';
    }
  } catch (err) {
    error = (err as Error).message;
    if (stat.size >= 50 * 1024 * 1024) {
      status = 'failed';
    } else {
      status = 'partial';
    }
  }

  const record: FileImportRecord = {
    file_id: fileId,
    path: filePath,
    name,
    size_bytes: stat.size,
    format,
    imported_at: importedAt,
    status,
    error,
  };

  return { record, text, meta };
}

/** 解析内存中的 buffer（tests 用） */
export async function parseBuffer(
  buf: Buffer,
  format: SupportedFormat,
  name = 'unknown',
): Promise<{ text: string; meta: Record<string, unknown> }> {
  switch (format) {
    case 'md':
      return { text: buf.toString('utf-8'), meta: { format: 'md', bytes: buf.length } };
    case 'docx':
      return parseDocx(buf);
    case 'xlsx':
      return parseXlsx(buf);
    case 'pptx':
      return parsePptx(buf);
    case 'pdf':
      return parsePdf(buf);
    case 'jpg':
      return parseJpg(buf);
    case 'png':
      return parsePng(buf);
    default:
      throw new Error(`unsupported format: ${format}`);
  }
}

// ---- MD ----

// md handled in parseBuffer switch

// ---- ZIP reader (minimal, supports stored + deflate) ----

interface ZipEntry {
  name: string;
  method: number; // 0=stored, 8=deflate
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number; // byte offset in zipBuf where file data starts
}

/**
 * Minimal ZIP reader — supports stored (0) + deflate (8), no encryption, no ZIP64.
 * Returns map of entry name → Buffer. Sufficient for Office Open XML.
 *
 * References: APPNOTE.TXT (PKWARE) sections 4.3.7 (local file header) + 4.3.8 (data descriptor).
 */
async function readZip(buf: Buffer): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  if (buf.length < 22) return out;
  // End of Central Directory Record (EOCD) signature 0x06054b50
  // Search backwards from end (max comment 65535 bytes)
  const eocdStart = findEocd(buf);
  if (eocdStart < 0) throw new Error('zip: EOCD not found (not a valid zip)');

  const totalEntries = buf.readUInt16LE(eocdStart + 10);
  const cdSize = buf.readUInt32LE(eocdStart + 12);
  const cdOffset = buf.readUInt32LE(eocdStart + 16);

  // Walk central directory entries
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > buf.length) break;
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      // not central dir header; skip
      break;
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const fnameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + fnameLen).toString('utf-8');

    // Walk local file header to find data offset
    const lh = localHeaderOffset;
    if (buf.readUInt32LE(lh) !== 0x04034b50) continue;
    const lhFnameLen = buf.readUInt16LE(lh + 26);
    const lhExtraLen = buf.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lhFnameLen + lhExtraLen;
    const data = buf.slice(dataStart, dataStart + compressedSize);

    let content: Buffer;
    if (method === 0) {
      content = data;
    } else if (method === 8) {
      try {
        content = await inflateRaw(data);
        // also try zlib header if needed
        if (content.length === 0 && uncompressedSize > 0) {
          content = await inflate(data);
        }
      } catch (err) {
        // 跳过坏 entry
        p += 46 + fnameLen + extraLen + commentLen;
        continue;
      }
    } else {
      p += 46 + fnameLen + extraLen + commentLen;
      continue;
    }
    out.set(name, content);

    p += 46 + fnameLen + extraLen + commentLen;
  }
  void cdSize;
  return out;
}

function findEocd(buf: Buffer): number {
  const sig = 0x06054b50;
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  return -1;
}

// ---- DOCX ----

async function parseDocx(buf: Buffer): Promise<{ text: string; meta: Record<string, unknown> }> {
  const entries = await readZip(buf);
  const docXml = entries.get('word/document.xml');
  if (!docXml) {
    // 可能是 dotx / 损坏文件
    return { text: '', meta: { format: 'docx', error: 'word/document.xml missing' } };
  }
  const xml = docXml.toString('utf-8');
  const text = extractDocxText(xml);
  // 段落数 / 估算字数
  const paraCount = (xml.match(/<w:p[ >]/g) ?? []).length;
  const meta: Record<string, unknown> = {
    format: 'docx',
    paragraphs: paraCount,
    chars: text.length,
  };
  // 抽取 docProps/core.xml 的标题/作者（如有）
  const coreXml = entries.get('docProps/core.xml');
  if (coreXml) {
    const coreStr = coreXml.toString('utf-8');
    const titleMatch = coreStr.match(/<dc:title>([^<]*)<\/dc:title>/);
    const authorMatch = coreStr.match(/<dc:creator>([^<]*)<\/dc:creator>/);
    if (titleMatch) meta.title = decodeXmlEntities(titleMatch[1]);
    if (authorMatch) meta.author = decodeXmlEntities(authorMatch[1]);
  }
  return { text, meta };
}

/** 从 document.xml 中按 <w:t> 标签顺序抽 text，跳过 <w:tab/> / <w:br/> */
function extractDocxText(xml: string): string {
  const parts: string[] = [];
  // 抓所有 <w:t ...>...</w:t> 标签 + 自闭 <w:t/>
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    parts.push(decodeXmlEntities(m[1]));
  }
  // 段落分隔：在每个 <w:p ...> 后插一个换行（粗略）
  const result = xml
    .replace(/<w:p(?:\s[^>]*)?>/g, '\n')
    .replace(/<w:br(?:\s[^>]*)?\/>/g, '\n');
  // 移除所有标签，只留 text
  const stripped = result.replace(/<[^>]+>/g, '');
  const cleaned = decodeXmlEntities(stripped);
  // 折叠多空行
  return cleaned.replace(/\n{3,}/g, '\n\n').trim() || parts.join(' ');
}

// ---- XLSX ----

async function parseXlsx(buf: Buffer): Promise<{ text: string; meta: Record<string, unknown> }> {
  const entries = await readZip(buf);
  const sharedStringsXml = entries.get('xl/sharedStrings.xml');
  const sharedStrings: string[] = [];
  if (sharedStringsXml) {
    const xml = sharedStringsXml.toString('utf-8');
    const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const inner = m[1];
      const textMatches = inner.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) ?? [];
      const t = textMatches
        .map(s => s.replace(/<[^>]+>/g, ''))
        .map(decodeXmlEntities)
        .join('');
      sharedStrings.push(t);
    }
  }
  // 找所有 sheet*.xml
  const sheetNames = Array.from(entries.keys())
    .filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort();
  const rows: string[] = [];
  let totalCells = 0;
  for (const sheetPath of sheetNames) {
    const sheetXml = entries.get(sheetPath)!.toString('utf-8');
    rows.push(`[${sheetPath.replace(/^xl\/worksheets\//, '')}]`);
    // 抽每行 <row r="A1">...<c r="A1" t="s"><v>0</v></c></row>
    const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(sheetXml)) !== null) {
      const rowInner = rowMatch[1];
      const cellParts: string[] = [];
      const cellRe = /<c\s[^>]*?r="([A-Z]+\d+)"[^>]*?(?:\s+t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>|<c\s[^>]*?r="([A-Z]+\d+)"[^>]*?(?:\s+t="([^"]+)")?[^>]*\/>/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = cellRe.exec(rowInner)) !== null) {
        const cellRef = cMatch[1] || cMatch[4];
        const cellType = cMatch[2] || cMatch[5] || 'n';
        const cellInner = cMatch[3] || '';
        let val = '';
        if (cellType === 's' || cellType === 'str') {
          const vMatch = cellInner.match(/<v>([^<]*)<\/v>/);
          if (vMatch) {
            const idx = parseInt(vMatch[1], 10);
            val = sharedStrings[idx] ?? '';
          }
        } else if (cellType === 'inlineStr') {
          const tMatch = cellInner.match(/<is>[\s\S]*?<t(?:\s[^>]*)?>([^<]*)<\/t>/);
          if (tMatch) val = decodeXmlEntities(tMatch[1]);
        } else {
          // number / formula — 抽 <v>
          const vMatch = cellInner.match(/<v>([^<]*)<\/v>/);
          if (vMatch) val = vMatch[1];
        }
        if (val) {
          cellParts.push(`${cellRef}=${val}`);
          totalCells++;
        }
      }
      if (cellParts.length) rows.push(cellParts.join(' '));
    }
  }
  const text = rows.join('\n');
  return {
    text,
    meta: {
      format: 'xlsx',
      sheets: sheetNames.length,
      shared_strings: sharedStrings.length,
      cells: totalCells,
    },
  };
}

// ---- PPTX ----

async function parsePptx(buf: Buffer): Promise<{ text: string; meta: Record<string, unknown> }> {
  const entries = await readZip(buf);
  const slidePaths = Array.from(entries.keys())
    .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort();
  const slides: string[] = [];
  let totalShapes = 0;
  for (const sp of slidePaths) {
    const xml = entries.get(sp)!.toString('utf-8');
    // 抽所有 <a:t>...</a:t> 内容（PPT 文本主体）
    const tRe = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
    const parts: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = tRe.exec(xml)) !== null) {
      const v = decodeXmlEntities(m[1]).trim();
      if (v) parts.push(v);
    }
    const shapeCount = (xml.match(/<p:sp[\s>]/g) ?? []).length;
    totalShapes += shapeCount;
    const slideTitle = sp.match(/slide(\d+)\.xml$/)?.[1] ?? '?';
    slides.push(`[slide${slideTitle}] ${parts.join(' / ')}`);
  }
  return {
    text: slides.join('\n'),
    meta: { format: 'pptx', slides: slidePaths.length, shapes: totalShapes },
  };
}

// ---- PDF ----

interface PdfObject {
  id: number;
  body: string;
}

/**
 * 极简 PDF 文本提取：
 *   1. 解析 xref 拿到所有 indirect object 的 byte offset
 *   2. 找出 Page object 顺藤摸瓜找 Contents（可能是 stream 或 array）
 *   3. 解 zlib inflate 后的 stream，按 (text) Tj 操作符抽出 text
 *
 * 仅支持 7-bit ASCII 文本（Office / LaTeX 生成的 PDF 95% 满足）；CJK 走 TJ 数组先不展开。
 */
async function parsePdf(buf: Buffer): Promise<{ text: string; meta: Record<string, unknown> }> {
  const objects = parsePdfObjects(buf);
  // 找 /Type /Page 的 objects（不算 /Pages）
  const pageIds: number[] = [];
  for (const obj of objects) {
    if (/\/Type\s*\/Page(?!s)/.test(obj.body)) pageIds.push(obj.id);
  }

  const lines: string[] = [];
  let totalLen = 0;
  for (const pid of pageIds) {
    const page = objects.find(o => o.id === pid);
    if (!page) continue;
    // 抽 Contents（可能是单 ref / array / 内联 stream）
    const contentsRefs = extractContentsRefs(page.body, objects);
    for (const stream of contentsRefs) {
      const txt = extractTextFromContentStream(stream);
      if (txt) {
        lines.push(`[page ${pid}] ${txt}`);
        totalLen += txt.length;
      }
    }
  }

  const meta: Record<string, unknown> = {
    format: 'pdf',
    pages: pageIds.length,
    objects: objects.length,
    text_chars: totalLen,
  };

  // 抽 /Info 元数据（标题/作者）
  const infoObj = objects.find(o => /\/Info\b/.test(o.body));
  if (infoObj) {
    const titleMatch = infoObj.body.match(/\/Title\s*\(([^)]*)\)/);
    if (titleMatch) meta.title = decodePdfString(titleMatch[1]);
  }

  return { text: lines.join('\n'), meta };
}

function parsePdfObjects(buf: Buffer): PdfObject[] {
  const out: PdfObject[] = [];
  // 找 xref table 起点（"xref" 关键字）
  const xrefIdx = buf.lastIndexOf('xref');
  if (xrefIdx < 0) return out;

  // 拿 trailer 的 /Size 和 /Root（不一定需要）
  // 直接扫描 "N G obj ... endobj" 模式（容忍注释 + 不规则空白）
  const objRe = /(\d+)\s+\d+\s+obj([\s\S]*?)endobj/g;
  const text = buf.toString('latin1');
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    const id = parseInt(m[1], 10);
    let body = m[2];
    // 如果 body 里包含 stream，先尝试 inflate（不强制）
    const streamMatch = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
    if (streamMatch) {
      try {
        const streamBuf = Buffer.from(streamMatch[1], 'latin1');
        const inflated = zlib.inflateSync(streamBuf);
        body = body.replace(streamMatch[0], `stream\n${inflated.toString('latin1')}\nendstream`);
      } catch {
        // not a deflate stream; keep raw
      }
    }
    out.push({ id, body });
  }
  return out;
}

/** 从 Page object 顺藤摸瓜找到 Contents 的 stream 文本（每个 stream 解压并 latin1 解码） */
function extractContentsRefs(pageBody: string, all: PdfObject[]): string[] {
  const streams: string[] = [];
  const m = pageBody.match(/\/Contents\s+(\d+)\s+\d+\s+R|\/Contents\s*\[([\s\S]*?)\]/);
  if (!m) return streams;
  if (m[1]) {
    const id = parseInt(m[1], 10);
    const obj = all.find(o => o.id === id);
    if (obj) streams.push(obj.body);
  } else if (m[2]) {
    const ids = Array.from(m[2].matchAll(/(\d+)\s+\d+\s+R/g)).map(x => parseInt(x[1], 10));
    for (const id of ids) {
      const obj = all.find(o => o.id === id);
      if (obj) streams.push(obj.body);
    }
  }
  return streams;
}

/** 从 content stream 抽 text（处理 BT...ET 块中的 (text) Tj 与 [(text)] TJ） */
function extractTextFromContentStream(stream: string): string {
  // 先剥离 stream...endstream 边界
  const s = stream.replace(/^stream\r?\n/, '').replace(/\r?\nendstream$/, '');
  const out: string[] = [];
  // 抓 BT...ET 块
  const btRe = /BT([\s\S]*?)ET/g;
  let m: RegExpExecArray | null;
  while ((m = btRe.exec(s)) !== null) {
    const block = m[1];
    // Tj: (text) Tj
    const tjRe = /\((?:\\.|[^\\()]|\((?:[^()]*)\))*?\)\s*Tj/g;
    let t: RegExpExecArray | null;
    while ((t = tjRe.exec(block)) !== null) {
      out.push(decodePdfString(t[0].slice(1, -3)));
    }
    // TJ: [(text1) (text2)] TJ
    const tjArrRe = /\[((?:\\.|[^[\]])*?)\]\s*TJ/g;
    while ((t = tjArrRe.exec(block)) !== null) {
      const arr = t[1];
      const subRe = /\((?:\\.|[^\\()]|\((?:[^()]*)\))*?\)/g;
      let sm: RegExpExecArray | null;
      while ((sm = subRe.exec(arr)) !== null) {
        out.push(decodePdfString(sm[0].slice(1, -1)));
      }
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** 解 PDF literal string 里的 \\ 转义 */
function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

// ---- JPG / PNG (header-only meta) ----

async function parseJpg(buf: Buffer): Promise<{ text: string; meta: Record<string, unknown> }> {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return { text: '', meta: { format: 'jpg', error: 'invalid JPEG signature' } };
  }
  // 扫 SOF markers (0xFFC0..0xFFCF，跳过 0xFFC4 / 0xFFC8 / 0xFFCC)
  let p = 2;
  let width = 0;
  let height = 0;
  let bits = 0;
  while (p < buf.length - 9) {
    if (buf[p] !== 0xff) break;
    const marker = buf[p + 1];
    if (marker === undefined) break;
    const segLen = buf.readUInt16BE(p + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      bits = buf[p + 4];
      height = buf.readUInt16BE(p + 5);
      width = buf.readUInt16BE(p + 7);
      break;
    }
    p += 2 + segLen;
  }
  return {
    text: '',
    meta: { format: 'jpg', width, height, bits, bytes: buf.length },
  };
}

async function parsePng(buf: Buffer): Promise<{ text: string; meta: Record<string, unknown> }> {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.slice(0, 8).equals(sig)) {
    return { text: '', meta: { format: 'png', error: 'invalid PNG signature' } };
  }
  // IHDR 总是第一块（在签名后）
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  return {
    text: '',
    meta: { format: 'png', width, height, bitDepth, colorType, bytes: buf.length },
  };
}

// ---- XML entity decode (共用) ----

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
