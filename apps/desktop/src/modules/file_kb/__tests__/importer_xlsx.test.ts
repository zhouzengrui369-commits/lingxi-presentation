/**
 * test_importer_xlsx — 验证 XLSX 导入
 * 灵犀演示 · Phase 1 · T-1.1
 */
import { importFile } from '../importer';
import * as path from 'path';

describe('importer: xlsx', () => {
  it('imports real generated xlsx and extracts shared strings', async () => {
    const sample = path.resolve(__dirname, '../../../../../testdata/xlsx_sample.xlsx');
    const r = await importFile(sample);
    expect(r.record.format).toBe('xlsx');
    expect(r.record.status).toBe('ok');
    expect(r.text).toContain('Q1 2026');
    expect(r.text).toContain('营收达成率');
    expect(r.text).toContain('风险登记');
    expect(r.meta.sheets).toBe(2);
    expect(r.meta.cells as number).toBeGreaterThan(0);
  });
});