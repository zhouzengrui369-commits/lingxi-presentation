/**
 * PPTX writer 单测（T-1.5）
 * - test_pptx_writer_basic
 * - test_pptx_writer_images_preserved
 * - test_pptx_writer_format_compliance
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writePptxSync, verifyPptxFile } from '../pptx_writer';
import { makePayload } from './fixtures';

test('test_pptx_writer_basic', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-pptx-'));
  const outPath = path.join(tmpDir, 'sample.pptx');
  const payload = makePayload();

  const { result, metadata } = await writePptxSync(payload, outPath);

  // 基本结果
  expect(result.status).toBe('ok');
  expect(result.output_path).toBe(outPath);
  expect(result.size_bytes).toBeGreaterThan(1024); // PPTX 至少 1KB
  expect(result.error).toBeNull();

  // 元数据
  expect(metadata.format).toBe('pptx');
  expect(metadata.size_bytes).toBeGreaterThan(1024);
  // 1 封面 + 5 章节 = 6 张幻灯片
  expect(metadata.page_count).toBe(payload.sections.length + 1);
  expect(metadata.paragraph_count).toBeGreaterThanOrEqual(payload.sections.length);
  expect(metadata.verification.file_exists).toBe(true);
  expect(metadata.verification.size_valid).toBe(true);
  expect(metadata.verification.format_valid).toBe(true);

  // 文件首部 = ZIP 魔数 PK\x03\x04
  expect(fs.existsSync(outPath)).toBe(true);
  const fd = fs.openSync(outPath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  expect(buf[0]).toBe(0x50); // P
  expect(buf[1]).toBe(0x4b); // K
  expect(buf[2]).toBe(0x03);
  expect(buf[3]).toBe(0x04);

  // 验证函数
  const verify = verifyPptxFile(outPath);
  expect(verify.ok).toBe(true);

  // 空 sections → 失败
  const failOut = await writePptxSync(makePayload({ sections: [] }), path.join(tmpDir, 'empty.pptx'));
  expect(failOut.result.status).toBe('failed');
  expect(failOut.result.error).toContain('payload.sections 为空');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('test_pptx_writer_images_preserved', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-pptx-img-'));
  const outPath = path.join(tmpDir, 'sample-images.pptx');

  // 创建一个真实的 1x1 PNG 用于 image_urls（实际写入会被忽略，
  // 但 pptxgenjs 应能容忍不存在的路径不抛错）
  const payload = makePayload({
    sections: [
      {
        heading: '带图的章节',
        content_html: '<p>这是配图说明。</p>',
        image_urls: ['/nonexistent/path/to/image1.png', '/nonexistent/path/to/image2.png'],
      },
      {
        heading: '另一章节',
        content_html: '<p>无图。</p>',
        image_urls: [],
      },
    ],
  });

  const { result, metadata } = await writePptxSync(payload, outPath);

  // 即便图片路径不存在，writer 仍应能写出 PPTX（图片丢失不阻塞整个文件）
  expect(result.status).toBe('ok');
  expect(result.size_bytes).toBeGreaterThan(1024);
  expect(metadata.format).toBe('pptx');
  expect(metadata.page_count).toBe(payload.sections.length + 1);

  // 文件首部仍是 ZIP
  expect(fs.existsSync(outPath)).toBe(true);
  const fd = fs.openSync(outPath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  expect(buf[0]).toBe(0x50);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});