/**
 * test_importer_docx — 验证 DOCX 导入
 * 灵犀演示 · Phase 1 · T-1.1
 */
import { importFile } from '../importer';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('importer: docx', () => {
  it('imports real generated docx and extracts paragraphs', async () => {
    const sample = path.resolve(__dirname, '../../../../../testdata/docx_sample.docx');
    const r = await importFile(sample);
    expect(r.record.format).toBe('docx');
    expect(r.record.status).toBe('ok');
    expect(r.text).toContain('季度汇报');
    expect(r.text).toContain('营收');
    const para = r.meta.paragraphs as number;
    expect(para).toBeGreaterThan(3);
  });

  it('handles truncated docx gracefully (partial status)', async () => {
    const tmp = path.join(require('os').tmpdir(), `bad_${Date.now()}.docx`);
    await fs.writeFile(tmp, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // ZIP magic only
    try {
      const r = await importFile(tmp);
      // 应该 partial（文件 < 50M），错误信息可见
      expect(['partial', 'failed']).toContain(r.record.status);
      if (r.record.status !== 'ok') expect(r.record.error).toBeTruthy();
    } finally {
      await fs.unlink(tmp);
    }
  });
});