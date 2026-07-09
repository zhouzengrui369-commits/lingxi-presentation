/**
 * test_importer_png — 验证 PNG 导入（OCR/VL mock）
 * 灵犀演示 · Phase 1 · T-1.1
 */
import { importFile } from '../importer';
import * as path from 'path';

describe('importer: png', () => {
  it('imports real generated png and extracts IHDR width/height', async () => {
    const sample = path.resolve(__dirname, '../../../../../testdata/png_sample.png');
    const r = await importFile(sample);
    expect(r.record.format).toBe('png');
    expect(r.record.status).toBe('ok');
    expect(r.meta.width).toBe(800);
    expect(r.meta.height).toBe(600);
    expect(r.text).toBe('');
  });

  it('rejects invalid png with partial status', async () => {
    const tmp = require('path').join(require('os').tmpdir(), `bad_${Date.now()}.png`);
    const { promises: fs } = require('fs');
    await fs.writeFile(tmp, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00])); // truncated
    try {
      const r = await importFile(tmp);
      expect(['partial', 'failed']).toContain(r.record.status);
      if (r.record.status !== 'ok') {
        expect(r.record.error).toMatch(/png|signature/i);
      }
    } finally {
      await fs.unlink(tmp);
    }
  });
});