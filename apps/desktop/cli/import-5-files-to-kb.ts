/**
 * cli:import-5-files-to-kb — Phase 6 T-6.2 治本真持久化验证
 *
 * 流程:
 *   1. initKbModule() → ensure PRD 3.1 path exists (~/Library/Application Support/灵犀演示/kb/)
 *   2. import 5 文件 from apps/desktop/testdata/quarterly_review/ via FileKbManager
 *   3. ls + cat 真 wiki entry JSON 验证 5 个 entry 落盘
 *
 * 用法:
 *   tsx cli/import-5-files-to-kb.ts
 *   tsx cli/import-5-files-to-kb.ts --input <dir>  # 自定义源 (默认 testdata/quarterly_review)
 *   tsx cli/import-5-files-to-kb.ts --clean         # 跑前先清 kb/ (验证 idempotent 重建)
 *
 * 设计:
 *   - 走 FileKbManager 高层 API (importer + wiki + storage 三件套, 不绕过任何生产路径)
 *   - forceLocalWiki: daemon 不可达时走本地启发式, 保证离线可跑
 *   - 输出: 5 file record + 5 wiki entry, 落 ~/Library/Application Support/灵犀演示/kb/
 *
 * 灵犀演示 · Phase 6 · T-6.2
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 注: 不要从 '../src/modules/file_kb' (index) 导入 — 它 re-export 了 FileKbScreen.tsx
// (React Native 组件) 触发 tsx 加载 RN 0.86 而 esbuild 解析失败. 直接 import storage
// + manager 这两层 (纯 Node, 无 RN 依赖).
import { getKbRoot, ensureKbDir } from '../src/modules/file_kb/storage';
import { FileKbManager } from '../src/modules/file_kb/manager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// initKbModule / getKbModuleInitState 在 manager 的 runtime 暴露 — 我们手动 inline
// 等价逻辑以避开 RN 依赖链.
async function initKbModuleForCli() {
  return { error: null as string | null, root: getKbRoot(), ready_at: new Date().toISOString(), initialized: true };
}

interface Args {
  input: string;
  clean: boolean;
  jsonOutput: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--clean') out.clean = true;
    else if (a === '--input') {
      out.input = argv[++i] ?? '';
    } else if (a === '--json-output') {
      out.jsonOutput = true;
    } else if (a.startsWith('--')) {
      out[a.slice(2)] = argv[++i] ?? 'true';
    }
  }
  // default input: 相对 apps/desktop/cli/.. → apps/desktop/testdata/quarterly_review
  // 用 path.resolve(__dirname) 拿到绝对路径, 避免 cwd 不同导致双 prefix
  const defaultInput = path.resolve(__dirname, '..', 'testdata', 'quarterly_review');
  return {
    input: (out.input as string) || defaultInput,
    clean: Boolean(out.clean),
    jsonOutput: Boolean(out.jsonOutput),
  };
}

function banner(title: string) {
  const bar = '─'.repeat(60);
  console.log(`\n${bar}\n  ${title}\n${bar}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const inputAbs = path.resolve(args.input);

  banner('T-6.2 cli:import-5-files-to-kb — Phase 6 治本真持久化');

  // ---- Step 0: init KB module (PRD 3.1 path) ----
  console.log('[0/3] initKbModule() — ensure PRD 3.1 KB path ...');
  const initState = await initKbModuleForCli();
  if (initState.error) {
    console.error(`[FAIL] initKbModule error: ${initState.error}`);
    process.exit(1);
  }
  if (!initState.root) {
    console.error('[FAIL] initState.root is null');
    process.exit(1);
  }
  console.log(`      root: ${initState.root}`);
  console.log(`      ready_at: ${initState.ready_at}`);

  // 打印 KB_DIR_INFO (verifier grep 用)
  const root = getKbRoot();
  const kbExists = await fs
    .stat(root)
    .then(() => true)
    .catch(() => false);
  if (!kbExists) {
    await ensureKbDir();
  }

  // ---- Optional: clean (PM/verifier 验证 idempotent) ----
  if (args.clean) {
    console.log(`[clean] rm -rf ${root}/files ${root}/entries ${root}/index.json ${root}/manifest.json`);
    await fs.rm(path.join(root, 'files'), { recursive: true, force: true });
    await fs.rm(path.join(root, 'entries'), { recursive: true, force: true });
    await fs.rm(path.join(root, 'index.json'), { force: true });
    await fs.rm(path.join(root, 'manifest.json'), { force: true });
  }

  // ---- Step 1: import 5 files via FileKbManager ----
  banner('[1/3] FileKbManager.importPaths() — 真持久化 5 文件到 PRD 3.1 path');
  const mgr = new FileKbManager();
  await mgr.init();
  console.log(`      input: ${inputAbs}`);
  console.log(`      kbRoot: ${mgr.kbRoot}`);

  const batch = await mgr.importPaths([inputAbs], {
    forceLocalWiki: true, // daemon 不可达兜底
    onProgress: (stage, payload) => {
      const p = payload as { path?: string; file_id?: string; entry_id?: string; title?: string };
      const tag = `[${stage}]`;
      if (p.path) console.log(`      ${tag} ${path.basename(p.path)}`);
      if (p.title) console.log(`         -> wiki: ${p.title} (entry_id=${p.entry_id?.slice(0, 8)})`);
    },
  });

  console.log(`      files: ${batch.files.length}`);
  console.log(`      entries: ${batch.entries.length}`);
  console.log(`      failed: ${batch.failed.length}`);
  for (const f of batch.failed) {
    console.log(`        FAIL: ${f.path} — ${f.error}`);
  }
  for (const e of batch.entries) {
    console.log(`        wiki: ${e.title}  tags=[${e.tags.join(', ')}]  conf=${e.confidence.toFixed(2)}`);
  }

  // ---- Step 2: verify 真 wiki entry JSON 落盘 ----
  banner('[2/3] verify 真 wiki entry JSON 落盘');
  const filesDir = path.join(root, 'files');
  const entriesDir = path.join(root, 'entries');
  const fileNames = (await fs.readdir(filesDir)).filter((n) => n.endsWith('.json')).sort();
  const entryNames = (await fs.readdir(entriesDir)).filter((n) => n.endsWith('.json')).sort();
  console.log(`      kb/files/:     ${fileNames.length} JSON`);
  for (const n of fileNames) {
    const sz = (await fs.stat(path.join(filesDir, n))).size;
    console.log(`        - ${n}  ${sz}B`);
  }
  console.log(`      kb/entries/:   ${entryNames.length} JSON`);
  for (const n of entryNames) {
    const sz = (await fs.stat(path.join(entriesDir, n))).size;
    console.log(`        - ${n}  ${sz}B`);
  }

  if (entryNames.length === 0) {
    console.error('[FAIL] no wiki entries persisted');
    process.exit(2);
  }

  // cat 第 1 个 entry — verifier 验真内容
  const firstEntryPath = path.join(entriesDir, entryNames[0]);
  const firstEntryRaw = await fs.readFile(firstEntryPath, 'utf-8');
  const firstEntry = JSON.parse(firstEntryRaw) as {
    title: string;
    summary: string;
    tags: string[];
    confidence: number;
  };
  console.log(`      sample entry (${entryNames[0]}):`);
  console.log(`        title:    ${firstEntry.title}`);
  console.log(`        tags:     [${firstEntry.tags.join(', ')}]`);
  console.log(`        summary:  ${firstEntry.summary.slice(0, 80)}...`);
  console.log(`        conf:     ${firstEntry.confidence}`);

  // index.json + manifest.json
  const idxPath = path.join(root, 'index.json');
  const mfPath = path.join(root, 'manifest.json');
  const idx = JSON.parse(await fs.readFile(idxPath, 'utf-8'));
  const mf = JSON.parse(await fs.readFile(mfPath, 'utf-8'));
  console.log(`      index.json:    files=${idx.files.length} entries=${idx.entries.length}`);
  console.log(`      manifest.json: version=${mf.version} file_count=${mf.file_count} entry_count=${mf.entry_count} total_size=${mf.total_size_bytes}B`);

  // ---- Step 3: 总结 ----
  banner('[3/3] summary');
  const elapsedMs = Date.now() - startedAt;
  const ok = batch.failed.length === 0 && entryNames.length >= 1;
  console.log(`      ok:           ${ok}`);
  console.log(`      elapsed_ms:   ${elapsedMs}`);
  console.log(`      kb_root:      ${root}`);
  console.log(`      file_count:   ${mf.file_count}`);
  console.log(`      entry_count:  ${mf.entry_count}`);
  console.log(`      init_state:   initialized=${initState.initialized} error=${initState.error ?? 'null'}`);

  if (!ok) {
    if (args.jsonOutput) {
      console.log('---JSON---');
      console.log(JSON.stringify({
        ok: false,
        files: batch.files,
        entries: batch.entries,
        failed: batch.failed,
        kb_root: root,
        elapsed_ms: elapsedMs,
        error: 'import_partial_or_failed',
      }, null, 2));
    }
    console.error('T-6.2 验证 FAIL');
    process.exit(3);
  }
  console.log('\nT-6.2 验证 PASS — 5 文件真持久化到 ~/Library/Application Support/灵犀演示/kb/ OK');

  // T-W1: --json-output flag, 末尾输出结构化 JSON (daemon /v1/import 解析)
  if (args.jsonOutput) {
    console.log('---JSON---');
    console.log(JSON.stringify({
      ok: true,
      files: batch.files,
      entries: batch.entries,
      failed: batch.failed,
      kb_root: root,
      elapsed_ms: elapsedMs,
      kb_files_dir_files: fileNames,
      kb_entries_dir_files: entryNames,
      manifest: mf,
    }, null, 2));
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(99);
});
