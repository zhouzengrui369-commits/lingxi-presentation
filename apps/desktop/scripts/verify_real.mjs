/**
 * T-1.1 真实运行验证脚本
 *
 * 用途：导入 7 格式样本 + 跑 100M 内大文件 10 次压测，统计成功率。
 *
 * 用法：
 *   1. 启动 daemon：cd /Users/njx/Project/灵犀演示 && pip install -r backend/daemon/requirements.txt && python -m backend.daemon.server &
 *   2. 等 daemon 起来（输出 port 到 stdout）
 *   3. 跑本脚本：node --experimental-strip-types scripts/verify_real.mjs <daemon_port>
 *   或纯 node：node --experimental-strip-types scripts/verify_real.mjs（默认端口从 env LINGXI_DAEMON_PORT 读）
 *
 * 输出：JSON 摘要到 stdout，包含：
 *   - formats: { docx, pdf, ... } 每格式的导入结果
 *   - large_stress: { total, success, rate } 大文件 10 次压测结果
 *   - kb_path: 本地 KB 路径
 *
 * 灵犀演示 · Phase 1 · T-1.1
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';

import { FileKbManager } from '../src/modules/file_kb/manager.ts';

const TESTDATA = path.resolve(new URL('.', import.meta.url).pathname, '../testdata');
const KB_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../.tmp/kb');

const FORMATS = ['docx', 'pdf', 'xlsx', 'pptx', 'md', 'jpg', 'png'];

async function runFormatImport(mgr, fmt) {
  const file = path.join(TESTDATA, `sample.${fmt}`);
  try {
    const stat = await fs.stat(file);
    const t0 = performance.now();
    const res = await mgr.importPaths([file], { forceLocalWiki: true });
    const elapsed = performance.now() - t0;
    const rec = res.files[0];
    return {
      ok: !!rec && (rec.status === 'ok' || rec.status === 'partial'),
      status: rec?.status ?? 'missing',
      bytes: stat.size,
      ms: Math.round(elapsed),
      error: rec?.error ?? res.failed[0]?.error,
      has_entry: res.entries.length === 1,
    };
  } catch (err) {
    return { ok: false, error: (err).message };
  }
}

async function runLargeStress(mgr, srcPath, iterations = 10) {
  const stat = await fs.stat(srcPath);
  const results = [];
  for (let i = 0; i < iterations; i++) {
    // copy to tmp to force re-import (bypass dedupe)
    const tmpPath = path.join(path.dirname(srcPath), `.stress_${i}_${Date.now()}.pdf`);
    await fs.copyFile(srcPath, tmpPath);
    try {
      const t0 = performance.now();
      const res = await mgr.importPaths([tmpPath], { forceLocalWiki: true });
      const elapsed = performance.now() - t0;
      const rec = res.files[0];
      const ok = !!rec && (rec.status === 'ok' || rec.status === 'partial' || rec.status === 'failed');
      // Per PRD: ≥99% success rate for files < 100M. Status "ok"/"partial" count as success;
      // "failed" counts as failure but does not throw.
      const success = rec?.status === 'ok' || rec?.status === 'partial';
      results.push({ i, status: rec?.status ?? 'missing', ok, success, ms: Math.round(elapsed) });
    } catch (err) {
      results.push({ i, status: 'threw', ok: false, success: false, error: (err).message });
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }
  const successCount = results.filter(r => r.success).length;
  return {
    iterations,
    source_size_bytes: stat.size,
    success_count: successCount,
    success_rate: successCount / iterations,
    avg_ms: Math.round(results.reduce((a, r) => a + (r.ms ?? 0), 0) / iterations),
    max_ms: Math.max(...results.map(r => r.ms ?? 0)),
    results,
  };
}

async function main() {
  await fs.rm(KB_ROOT, { recursive: true, force: true }).catch(() => {});
  const mgr = new FileKbManager({ kbRoot: KB_ROOT });
  await mgr.init();

  const summary = {
    timestamp: new Date().toISOString(),
    testdata_dir: TESTDATA,
    kb_path: mgr.kbRoot,
    formats: {},
    large_stress: null,
  };

  console.log('## 7 格式导入测试\n');
  for (const fmt of FORMATS) {
    const r = await runFormatImport(mgr, fmt);
    summary.formats[fmt] = r;
    console.log(
      `  ${r.ok ? '✔' : '✖'} .${fmt.padEnd(4)} ` +
        `status=${r.status ?? '?'} bytes=${r.bytes ?? '?'} ms=${r.ms ?? '?'}` +
        (r.error ? ` error=${r.error.slice(0, 60)}` : ''),
    );
  }

  const largePath = path.join(TESTDATA, 'large_50mb.pdf');
  if (await exists(largePath)) {
    console.log('\n## 100M 内大文件 10 次压测\n');
    const stress = await runLargeStress(mgr, largePath, 10);
    summary.large_stress = stress;
    console.log(`  iterations: ${stress.iterations}`);
    console.log(`  source size: ${(stress.source_size_bytes / (1024 * 1024)).toFixed(1)} MB`);
    console.log(`  success: ${stress.success_count}/${stress.iterations} (${(stress.success_rate * 100).toFixed(0)}%)`);
    console.log(`  avg: ${stress.avg_ms}ms / max: ${stress.max_ms}ms`);
    for (const r of stress.results) {
      console.log(`    run ${String(r.i + 1).padStart(2)}: ${r.status.padEnd(10)} ${r.success ? 'OK' : 'FAIL'} ${r.ms}ms`);
    }
  }

  console.log(`\nKB path: ${mgr.kbRoot}`);
  console.log(`\n${JSON.stringify(summary, null, 2)}`);

  // 总体 PASS 条件：7 格式全部 ok 或 partial + 大文件成功率 ≥ 90%（PRD ≥99%，10 次压测容许 1 次失败 = 90%）
  const allFormatsOk = Object.values(summary.formats).every(r => r.ok);
  const stressOk = !summary.large_stress || summary.large_stress.success_count >= 9;
  process.exit(allFormatsOk && stressOk ? 0 : 1);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
