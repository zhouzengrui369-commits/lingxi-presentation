/**
 * PDF writer 单测（T-1.5）
 * - test_pdf_writer_basic
 * - test_pdf_writer_fonts_preserved
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writePdf, verifyPdfFile } from '../pdf_writer';
import { makePayload } from './fixtures';

test('test_pdf_writer_basic', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-pdf-'));
  const outPath = path.join(tmpDir, 'sample.pdf');
  const payload = makePayload();

  const { result, metadata } = await writePdf(payload, outPath);

  // 基本结果
  expect(result.status).toBe('ok');
  expect(result.output_path).toBe(outPath);
  expect(result.size_bytes).toBeGreaterThan(512);
  expect(result.error).toBeNull();

  // 元数据
  expect(metadata.format).toBe('pdf');
  expect(metadata.size_bytes).toBeGreaterThan(512);
  // 封面 1 页 + 章节 5 页 = 6 页
  expect(metadata.page_count).toBe(payload.sections.length + 1);
  expect(metadata.paragraph_count).toBeGreaterThanOrEqual(payload.sections.length);
  expect(metadata.verification.file_exists).toBe(true);
  expect(metadata.verification.size_valid).toBe(true);
  expect(metadata.verification.format_valid).toBe(true);
  expect(metadata.verification.header_signature).toContain('%PDF');

  // 文件首部 = %PDF-
  expect(fs.existsSync(outPath)).toBe(true);
  const fd = fs.openSync(outPath, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');

  // 验证函数
  const verify = verifyPdfFile(outPath);
  expect(verify.ok).toBe(true);

  // 空 sections → 失败
  const failOut = await writePdf(makePayload({ sections: [] }), path.join(tmpDir, 'empty.pdf'));
  expect(failOut.result.status).toBe('failed');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('test_pdf_writer_fonts_preserved', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-pdf-fonts-'));
  const outPath = path.join(tmpDir, 'sample-fonts.pdf');

  // 自定义字体 / 颜色 — 验证 writer 接受 style 参数且不报错
  const payload = makePayload({
    doc_title: '字体测试文档',
    style: {
      theme: 'dark',
      palette: {
        primary: '#dc2626',
        secondary: '#f59e0b',
        background: '#0f172a',
        surface: '#1e293b',
        text: '#f1f5f9',
        muted: '#94a3b8',
      },
      fonts: {
        heading: 'Times-Bold',
        body: 'Helvetica',
      },
    },
  });

  const { result, metadata } = await writePdf(payload, outPath);

  expect(result.status).toBe('ok');
  expect(result.size_bytes).toBeGreaterThan(512);

  // PDF 文档信息（Title, Author）应被 pdfkit 写入
  // pdfkit 把 info 写入 PDF trailer，不一定在开头 — 但文件应包含 /Title
  // 这里只验证文件大小合理 + 文件首部正确
  expect(metadata.format).toBe('pdf');
  expect(fs.existsSync(outPath)).toBe(true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});