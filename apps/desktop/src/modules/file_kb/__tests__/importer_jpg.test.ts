/**
 * test_importer_jpg — 验证 JPG 导入（OCR/VL mock）
 * 灵犀演示 · Phase 1 · T-1.1
 */
import { importFile } from '../importer';
import * as path from 'path';

describe('importer: jpg', () => {
  it('imports real generated jpg and extracts SOF width/height', async () => {
    const sample = path.resolve(__dirname, '../../../../../testdata/jpg_sample.jpg');
    const r = await importFile(sample);
    expect(r.record.format).toBe('jpg');
    expect(r.record.status).toBe('ok');
    // JPG 没有文本，但应正确解析 SOF 拿宽高
    expect(r.meta.width).toBe(1024);
    expect(r.meta.height).toBe(768);
    // text 字段允许为空（OCR 由 wiki.ts 后续调 VL 模型）
    expect(r.text).toBe('');
  });
});