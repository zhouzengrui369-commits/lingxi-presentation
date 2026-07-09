/**
 * test_importer_md — 验证 MD 导入
 * 灵犀演示 · Phase 1 · T-1.1
 */
import { importFile, detectFormat } from '../importer';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('importer: md', () => {
  it('detects md from extension', () => {
    expect(detectFormat('foo.md')).toBe('md');
    expect(detectFormat('foo.MD')).toBe('md');
    expect(detectFormat('foo.txt')).toBeNull();
  });

  it('imports md file with full text content', async () => {
    const tmp = path.join(os.tmpdir(), `t11_md_${Date.now()}.md`);
    const body = '# 标题\n\n这是灵犀演示的季度汇报内容。\n- 营收 108%\n- 同比 23%\n';
    await fs.writeFile(tmp, body, 'utf-8');
    try {
      const r = await importFile(tmp);
      expect(r.record.format).toBe('md');
      expect(r.record.status).toBe('ok');
      expect(r.record.error).toBeNull();
      expect(r.text).toContain('灵犀演示');
      expect(r.text).toContain('营收 108%');
      expect(r.text).toContain('# 标题');
      expect(r.meta.bytes).toBeGreaterThan(0);
    } finally {
      await fs.unlink(tmp);
    }
  });
});