/**
 * test_importer_pptx — 验证 PPTX 导入
 * 灵犀演示 · Phase 1 · T-1.1
 */
import { importFile } from '../importer';
import * as path from 'path';

describe('importer: pptx', () => {
  it('imports real generated pptx and extracts slide text', async () => {
    const sample = path.resolve(__dirname, '../../../../../testdata/pptx_sample.pptx');
    const r = await importFile(sample);
    expect(r.record.format).toBe('pptx');
    expect(r.record.status).toBe('ok');
    expect(r.text).toContain('灵犀演示');
    expect(r.text).toContain('营收概况');
    expect(r.text).toContain('风险与展望');
    expect(r.meta.slides as number).toBeGreaterThanOrEqual(5);
  });
});