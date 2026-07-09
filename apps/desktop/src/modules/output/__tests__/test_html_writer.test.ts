/**
 * HTML writer 单测（T-1.5）
 * - test_html_writer_inline_css
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeHtml, verifyHtmlFile } from '../html_writer';
import { makePayload, makeSourceHtml } from './fixtures';

test('test_html_writer_inline_css', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-html-'));
  const outPath = path.join(tmpDir, 'sample.html');
  const payload = makePayload();
  const sourceHtml = makeSourceHtml();

  const { result, metadata } = writeHtml(sourceHtml, payload, outPath);

  // result.status = ok
  expect(result.status).toBe('ok');
  expect(result.output_path).toBe(outPath);
  expect(result.size_bytes).toBeGreaterThan(0);
  expect(result.error).toBeNull();
  expect(result.preview_id).toBe(payload.preview_id);

  // metadata 完整
  expect(metadata.format).toBe('html');
  expect(metadata.size_bytes).toBeGreaterThan(0);
  expect(metadata.page_count).toBe(payload.sections.length);
  expect(metadata.paragraph_count).toBeGreaterThanOrEqual(payload.sections.length);
  expect(metadata.verification.file_exists).toBe(true);
  expect(metadata.verification.size_valid).toBe(true);
  expect(metadata.verification.format_valid).toBe(true);

  // 文件存在
  expect(fs.existsSync(outPath)).toBe(true);
  const written = fs.readFileSync(outPath, 'utf8');

  // 内联 CSS 存在（来自 sourceHtml）
  expect(written).toContain('<style>');
  expect(written).toContain('background: #ffffff');
  expect(written).toContain('.lx-section');

  // 元数据注入（meta name + ld+json）
  expect(written).toContain('name="lingxi-meta"');
  expect(written).toContain('application/ld+json');

  // 5 个章节都被保留
  const sectionMatches = written.match(/class="lx-section"/g);
  expect(sectionMatches?.length ?? 0).toBe(5);

  // 验证函数返回 ok
  const verify = verifyHtmlFile(outPath);
  expect(verify.ok).toBe(true);

  // 空 sourceHtml → 失败
  const failOut = writeHtml('', payload, path.join(tmpDir, 'empty.html'));
  expect(failOut.result.status).toBe('failed');
  expect(failOut.result.error).toContain('source HTML 为空');

  // 空 sections → 失败
  const emptyPayload = makePayload({ sections: [] });
  const failOut2 = writeHtml(sourceHtml, emptyPayload, path.join(tmpDir, 'nosec.html'));
  expect(failOut2.result.status).toBe('failed');

  // 清理
  fs.rmSync(tmpDir, { recursive: true, force: true });
});