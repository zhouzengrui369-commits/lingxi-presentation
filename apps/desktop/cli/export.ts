/**
 * cli:export — T-1.5 多格式输出 CLI（T-1.5 · PRD 3.5）
 * 灵犀演示 · Phase 1
 *
 * 用法：
 *   node --experimental-vm-modules cli/export.ts \
 *     --input apps/desktop/testdata/preview-sample.html \
 *     --format pptx --output /tmp/sample.pptx
 *
 * 流程：
 *   1. 读 HTML 文件（preview 模块的渲染产物）
 *   2. 用 format_router.dispatchExport 调对应 writer
 *   3. 写文件 + 打印 JSON 结果
 *
 * 设计：CLI 不直接调 writer，走 format_router（与 UI 共享同一路径），
 *      保证 Office 兼容性 / 文件格式校验 与 UI 一致。
 */

import * as fs from 'node:fs';
import { dispatchExport, verifyOutputFile, toExportPayload } from '../src/modules/output/format_router';
import type { OutputFormat } from '../src/modules/output/types';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

/** 从 preview HTML 抽取章节 — 简单正则解析（与 renderer.ts 输出格式严格匹配） */
function extractSections(html: string): Array<{ heading: string; content_html: string; image_urls: string[] }> {
  const sections: Array<{ heading: string; content_html: string; image_urls: string[] }> = [];
  const re = /<section class="lx-section"[^>]*>([\s\S]*?)<\/section>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const block = m[1];
    const headingMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const contentMatch = block.match(/<div class="lx-content"[^>]*>([\s\S]*?)<\/div>/);
    const imgMatches = [...block.matchAll(/<img[^>]+src="([^"]+)"/g)];
    sections.push({
      heading: headingMatch ? stripTags(headingMatch[1]) : '(未命名章节)',
      content_html: contentMatch ? contentMatch[1] : '',
      image_urls: imgMatches.map(x => x[1]),
    });
  }
  return sections;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

function genUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input;
  const format = args.format as OutputFormat;
  const outputPath = args.output;

  if (!input || !format || !outputPath) {
    console.error('用法: cli:export --input <preview.html> --format <pptx|pdf|docx|html> --output <out>');
    process.exit(2);
  }
  if (!['pptx', 'pdf', 'docx', 'html'].includes(format)) {
    console.error(`不支持的格式: ${format}（必填 pptx|pdf|docx|html）`);
    process.exit(2);
  }
  if (!fs.existsSync(input)) {
    console.error(`输入文件不存在: ${input}`);
    process.exit(2);
  }

  const sourceHtml = fs.readFileSync(input, 'utf8');
  const previewId = 'cli-' + genUuid().slice(0, 8);
  const sections = extractSections(sourceHtml);
  if (sections.length === 0) {
    console.error(`从 HTML 没解析到任何 <section class="lx-section"> 节点`);
    process.exit(3);
  }
  // 取 <h1 class="lx-doc-title"> 作为 doc_title
  const titleMatch = sourceHtml.match(/<h1 class="lx-doc-title"[^>]*>([\s\S]*?)<\/h1>/);
  const docTitle = titleMatch ? stripTags(titleMatch[1]) : sections[0].heading;

  const payload = toExportPayload(
    { preview_id: previewId, sections, html: sourceHtml },
    undefined,
    docTitle,
  );

  console.log(`[cli:export] 输入: ${input} (${(sourceHtml.length / 1024).toFixed(1)}KB)`);
  console.log(`[cli:export] 解析章节: ${sections.length}`);
  console.log(`[cli:export] 文档标题: ${docTitle}`);
  console.log(`[cli:export] 输出格式: ${format}`);
  console.log(`[cli:export] 输出路径: ${outputPath}`);

  const startedAt = Date.now();
  const { result, metadata } = await dispatchExport({
    request: {
      request_id: genUuid(),
      preview_id: previewId,
      format,
      output_path: outputPath,
      options: null,
    },
    sourceHtml,
    payload,
  });
  const elapsedMs = Date.now() - startedAt;

  const verify = verifyOutputFile(format, outputPath);
  const summary = {
    status: result.status,
    output_path: result.output_path,
    size_bytes: result.size_bytes,
    elapsed_ms: elapsedMs,
    error: result.error,
    metadata: {
      format: metadata.format,
      page_count: metadata.page_count,
      paragraph_count: metadata.paragraph_count,
      verification: {
        ...metadata.verification,
        verifier_ok: verify.ok,
        verifier_reason: verify.reason,
      },
    },
  };
  console.log('[cli:export] 结果:');
  console.log(JSON.stringify(summary, null, 2));

  if (result.status !== 'ok' || !verify.ok) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('[cli:export] 异常:', err);
  process.exit(99);
});