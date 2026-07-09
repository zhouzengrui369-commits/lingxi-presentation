/**
 * pptx_extract.ts — 把 .pptx 文件提取成 PPTXExtractedJson（Node 侧，shell 到 Python helper）
 *
 * 灵犀演示 · Phase 1 · T-1.3
 *
 * 链路:
 *   pptx_path → spawn /usr/bin/python3 backend/scripts/extract_pptx.py <path>
 *             → JSON stdout → PPTXExtractedJson
 *
 * 不在 React Native runtime 跑 — 只在 Node (CLI / 测试 / Node 服务端) 跑。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { PPTXExtractedJson } from './types';

const PYTHON = process.env.LINGXI_TEST_PY || process.env.LINGXI_PYTHON || '/usr/bin/python3';

/** 找 backend/scripts/extract_pptx.py（用环境变量可覆盖） */
export function findExtractorScript(): string {
  if (process.env.PPTX_EXTRACTOR_SCRIPT && existsSync(process.env.PPTX_EXTRACTOR_SCRIPT)) {
    return process.env.PPTX_EXTRACTOR_SCRIPT;
  }
  // __dirname = apps/desktop/src/modules/template, 上 4 级 = repo root
  const repoRoot = resolve(dirname(__dirname), '..', '..', '..', '..');
  return resolve(repoRoot, 'backend', 'scripts', 'extract_pptx.py');
}

/** 同步执行 python extract_pptx.py <path>，返回 PPTXExtractedJson。失败抛 Error。 */
export function parsePptx(pptxPath: string, python: string = PYTHON): PPTXExtractedJson {
  const script = findExtractorScript();
  const absPptx = resolve(pptxPath);
  if (!existsSync(script)) {
    throw new Error(`extract_pptx.py not found: ${script}`);
  }
  if (!existsSync(absPptx)) {
    throw new Error(`PPTX not found: ${absPptx}`);
  }
  const proc = spawnSync(python, [script, absPptx], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 60_000,
  });
  if (proc.status !== 0) {
    throw new Error(
      `extract_pptx.py failed (status=${proc.status}): ${proc.stderr || proc.stdout || '(no output)'}`,
    );
  }
  try {
    return JSON.parse(proc.stdout) as PPTXExtractedJson;
  } catch (e) {
    throw new Error(`extract_pptx.py output is not JSON: ${(e as Error).message}\nstdout head: ${proc.stdout.slice(0, 200)}`);
  }
}

/** 便捷 wrapper: parsePptx + analyzeStyle（确定性启发式，无 AI） */
export function analyzeHeuristic(pptxPath: string, opts: { name?: string; templateId?: string } = {}): import('./types').TemplateStyle {
  const { analyzeStyle } = require('./style_analyzer') as typeof import('./style_analyzer');
  const extracted = parsePptx(pptxPath);
  return analyzeStyle(extracted, opts);
}

/** 便捷 wrapper: parsePptx + analyzeAndExport（含 AI 兜底） */
export async function analyzeTemplate(
  pptxPath: string,
  opts: { name?: string; daemonUrl?: string } = {},
): Promise<import('./types').TemplateStyle> {
  const { analyzeAndExport } = require('./style_analyzer') as typeof import('./style_analyzer');
  const extracted = parsePptx(pptxPath);
  return analyzeAndExport(extracted, { ...opts, syncDaemon: !!opts.daemonUrl });
}
