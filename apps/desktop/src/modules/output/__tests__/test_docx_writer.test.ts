/**
 * DOCX writer 单测（T-1.5）
 * - test_docx_writer_basic
 * - test_docx_writer_paragraphs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeDocx, verifyDocxFile } from '../docx_writer';
import { makePayload } from './fixtures';

test('test_docx_writer_basic', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-docx-'));
  const outPath = path.join(tmpDir, 'sample.docx');
  const payload = makePayload();

  const { result, metadata } = await writeDocx(payload, outPath);

  expect(result.status).toBe('ok');
  expect(result.output_path).toBe(outPath);
  expect(result.size_bytes).toBeGreaterThan(1024);
  expect(result.error).toBeNull();

  expect(metadata.format).toBe('docx');
  expect(metadata.size_bytes).toBeGreaterThan(1024);
  // PRD: ≥ 3 段
  expect(metadata.paragraph_count).toBeGreaterThanOrEqual(3);
  expect(metadata.verification.file_exists).toBe(true);
  expect(metadata.verification.size_valid).toBe(true);
  expect(metadata.verification.format_valid).toBe(true);

  // DOCX 首部 = ZIP 魔数
  expect(fs.existsSync(outPath)).toBe(true);
  const fd = fs.openSync(outPath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  expect(buf[0]).toBe(0x50);
  expect(buf[1]).toBe(0x4b);
  expect(buf[2]).toBe(0x03);
  expect(buf[3]).toBe(0x04);

  const verify = verifyDocxFile(outPath);
  expect(verify.ok).toBe(true);

  // 空 sections → 失败
  const failOut = await writeDocx(makePayload({ sections: [] }), path.join(tmpDir, 'empty.docx'));
  expect(failOut.result.status).toBe('failed');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('test_docx_writer_paragraphs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-docx-p-'));
  const outPath = path.join(tmpDir, 'sample-paragraphs.docx');

  // 复杂段落：含 <p> + <strong> + <em> + <ul><li>
  const payload = makePayload({
    sections: [
      {
        heading: '段落测试',
        content_html:
          '<p>普通段落 <strong>加粗</strong> 与 <em>斜体</em>。</p>' +
          '<p>第二段。</p>' +
          '<ul><li>列表 1</li><li>列表 2</li><li>列表 3</li></ul>' +
          '<p>第三段。</p>',
        image_urls: [],
      },
      {
        heading: '空章节',
        content_html: '',
        image_urls: [],
      },
    ],
  });

  const { result, metadata } = await writeDocx(payload, outPath);

  expect(result.status).toBe('ok');
  expect(result.size_bytes).toBeGreaterThan(1024);
  // 文档大标题 + 2 章节标题 + 段落 = 至少 5 段
  expect(metadata.paragraph_count).toBeGreaterThanOrEqual(5);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});