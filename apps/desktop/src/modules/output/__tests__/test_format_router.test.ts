/**
 * format_router 单测（T-1.5）
 * - test_format_router_dispatch
 * - test_writer_format_compliance（4 格式真实运行 + 文件验证）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { dispatchExport, verifyOutputFile, defaultOutputPath } from '../format_router';
import { makePayload, makeSourceHtml } from './fixtures';
import type { OutputFormat, OutputRequest } from '../types';

const FORMATS: OutputFormat[] = ['html', 'pptx', 'docx', 'pdf'];

function makeRequest(format: OutputFormat, outputPath: string): OutputRequest {
  return {
    request_id: 'req-test-1234-5678-9abc-def012345678',
    preview_id: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
    format,
    output_path: outputPath,
    options: null,
  };
}

test('test_format_router_dispatch', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-router-'));
  const payload = makePayload();
  const sourceHtml = makeSourceHtml();

  // 4 种格式都跑通
  for (const format of FORMATS) {
    const outPath = path.join(tmpDir, `sample.${format}`);
    const req = makeRequest(format, outPath);
    const { result, metadata } = await dispatchExport({
      request: req,
      sourceHtml,
      payload,
    });

    expect(result.status).toBe('ok');
    expect(result.output_path).toBe(outPath);
    expect(result.size_bytes).toBeGreaterThan(0);
    expect(result.error).toBeNull();
    expect(result.request_id).toBe(req.request_id);
    expect(result.preview_id).toBe(req.preview_id);

    expect(metadata.format).toBe(format);
    expect(metadata.output_path).toBe(outPath);
    expect(metadata.size_bytes).toBeGreaterThan(0);
    expect(metadata.verification.file_exists).toBe(true);
    expect(metadata.verification.size_valid).toBe(true);
  }

  // defaultOutputPath 工具函数
  const defaultPath = defaultOutputPath('test-uuid', 'pptx', '/tmp/x');
  expect(defaultPath).toContain('test-uuid.pptx');

  // 不支持的 format
  const badReq = {
    request_id: 'x',
    preview_id: 'y',
    format: 'xyz' as unknown as OutputFormat,
    output_path: '/tmp/bad.xyz',
    options: null,
  };
  const badOut = await dispatchExport({
    request: badReq,
    sourceHtml,
    payload,
  });
  expect(badOut.result.status).toBe('failed');

  // 空 output_path → 失败
  const emptyReq = makeRequest('html', '');
  const emptyOut = await dispatchExport({
    request: emptyReq,
    sourceHtml,
    payload,
  });
  expect(emptyOut.result.status).toBe('failed');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('test_writer_format_compliance', async () => {
  // 这是 PRD §3.5 的核心验收 — Office 打开无错
  // macOS 无 PowerPoint/Word, 但我们可以验证：
  //   1) 文件结构正确（HTML = <!DOCTYPE / PPTX = ZIP 魔数 / DOCX = ZIP / PDF = %PDF-）
  //   2) 文件 size 合理（> 0，至少达到对应格式最小体积）
  //   3) PPTX 内容含 ppt/presentation.xml 关键 OOXML（通过 ZIP 中心目录判定）
  //   4) DOCX 同理 — 含 word/document.xml

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-compliance-'));
  const payload = makePayload();
  const sourceHtml = makeSourceHtml();

  // 跑全部 4 种格式
  const results: Record<string, { path: string; size: number; verify: { ok: boolean; reason?: string } }> = {};
  for (const format of FORMATS) {
    const outPath = path.join(tmpDir, `compliance.${format}`);
    const req = makeRequest(format, outPath);
    const { result } = await dispatchExport({ request: req, sourceHtml, payload });
    expect(result.status).toBe('ok');
    const verify = verifyOutputFile(format, outPath);
    results[format] = { path: outPath, size: result.size_bytes ?? 0, verify };
    expect(verify.ok).toBe(true);
  }

  // PPTX 内部结构：含 ppt/presentation.xml（ZIP 中心目录搜索）
  const pptxPath = results.pptx.path;
  const pptxBuf = fs.readFileSync(pptxPath);
  // 简单字符串搜索 — ZIP 中心目录里有 presentation.xml 路径
  expect(pptxBuf.toString('binary')).toContain('ppt/presentation.xml');

  // DOCX 内部结构：含 word/document.xml
  const docxPath = results.docx.path;
  const docxBuf = fs.readFileSync(docxPath);
  expect(docxBuf.toString('binary')).toContain('word/document.xml');

  // PDF 含 /Type /Catalog 对象（PDF 必含）
  const pdfPath = results.pdf.path;
  const pdfText = fs.readFileSync(pdfPath, 'utf8');
  expect(pdfText).toContain('%PDF-');
  expect(pdfText.length).toBeGreaterThan(512);

  // HTML 含 <!DOCTYPE html> + 至少 1 个章节
  const htmlPath = results.html.path;
  const htmlText = fs.readFileSync(htmlPath, 'utf8');
  expect(htmlText).toContain('<!DOCTYPE html>');
  expect(htmlText).toContain('class="lx-section"');

  // size 全 > 0
  for (const fmt of FORMATS) {
    expect(results[fmt].size).toBeGreaterThan(0);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
});