#!/usr/bin/env tsx
/**
 * cli.ts — 模板导入 CLI 入口
 *
 * 用法：
 *   tsx src/modules/template/cli.ts \
 *     --input apps/desktop/testdata/templates/business-dark.pptx \
 *     --output /tmp/business-dark-analysis.json
 *
 * 流程：
 *   1. 调 python backend/scripts/extract_pptx.py 抽 PPTX → JSON
 *   2. 调 analyzeStyle() 得到 TemplateStyle
 *   3. 调 pptxToHtml() 把所有 slide 转 HTML
 *   4. 写出 JSON（含 style + html）
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeStyle, analyzeAndExport } from './style_analyzer';
import { pptxToHtml } from './pptx_to_html';
import { BUILTIN_LIGHT, BUILTIN_DARK } from './builtin_themes';
import type { PPTXExtractedJson, TemplateStyle } from './types';

interface CliArgs {
  input: string;
  output: string;
  daemonUrl?: string;
  builtin?: 'light' | 'dark' | null;
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '-i') out.input = argv[++i];
    else if (a === '--output' || a === '-o') out.output = argv[++i];
    else if (a === '--daemon-url') out.daemonUrl = argv[++i];
    else if (a === '--builtin') out.builtin = argv[++i] as 'light' | 'dark';
  }
  if (!out.input || !out.output) {
    console.error('Usage: tsx cli.ts --input <file.pptx> --output <out.json> [--builtin light|dark] [--daemon-url http://127.0.0.1:PORT]');
    process.exit(2);
  }
  return out as CliArgs;
}

function findPython(): string {
  // 优先 .venv/bin/python（项目内）
  const here = dirname(fileURLToPath(import.meta.url));
  // __dirname = apps/desktop/src/modules/template, 上 4 级 = repo root
  const repoRoot = resolve(here, '..', '..', '..', '..');
  const candidates = [
    resolve(repoRoot, '.venv', 'bin', 'python'),
    resolve(repoRoot, '.venv', 'bin', 'python3'),
    'python3',
    'python',
  ];
  for (const c of candidates) {
    if (c.includes('/') && existsSync(c)) return c;
  }
  return 'python3';
}

function extractWithPython(pptxPath: string): PPTXExtractedJson {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..', '..', '..', '..');
  const scriptPath = resolve(repoRoot, 'backend', 'scripts', 'extract_pptx.py');
  const py = findPython();
  const proc = spawnSync(py, [scriptPath, pptxPath], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    throw new Error(
      `extract_pptx.py failed (status=${proc.status}): ${proc.stderr || proc.stdout || '(no output)'}`,
    );
  }
  return JSON.parse(proc.stdout);
}

interface ExportPayload {
  source: 'imported' | 'builtin';
  input_file: string;
  template_style: TemplateStyle;
  html_preview: string;
  extracted?: PPTXExtractedJson;
  generated_at: string;
  analyzer_version: string;
}

export async function runImport(args: CliArgs): Promise<ExportPayload> {
  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) {
    throw new Error(`input not found: ${inputPath}`);
  }

  // 内置主题路径（不抽 PPTX）
  if (args.builtin) {
    const style = args.builtin === 'dark' ? BUILTIN_DARK : BUILTIN_LIGHT;
    const payload: ExportPayload = {
      source: 'builtin',
      input_file: basename(inputPath),
      template_style: style,
      html_preview: `<!DOCTYPE html><html><body><main><section class="lingxi-slide">${style.name} (${style.template_id})</section></main></body></html>`,
      generated_at: new Date().toISOString(),
      analyzer_version: style.analyzer_version,
    };
    return payload;
  }

  // 导入路径
  const extracted = extractWithPython(inputPath);
  const style = args.daemonUrl
    ? await analyzeAndExport(extracted, { daemonUrl: args.daemonUrl, syncDaemon: true })
    : analyzeStyle(extracted);
  const html = pptxToHtml(extracted, { style });

  const payload: ExportPayload = {
    source: 'imported',
    input_file: basename(inputPath),
    template_style: style,
    html_preview: html,
    extracted,
    generated_at: new Date().toISOString(),
    analyzer_version: style.analyzer_version,
  };
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const payload = await runImport(args);
    writeFileSync(args.output, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`[OK] wrote ${args.output} (${JSON.stringify(payload.template_style).length} bytes)`);
    console.log(`     template_id: ${payload.template_style.template_id}`);
    console.log(`     layout_types: ${payload.template_style.layout_types.join(', ')}`);
    console.log(`     palette: primary=${payload.template_style.palette.primary} accent=${payload.template_style.palette.accent}`);
  } catch (err) {
    console.error('[FAIL]', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// CLI only when invoked directly
const isMainModule = (() => {
  try {
    const url = fileURLToPath(import.meta.url);
    return process.argv[1] && url.endsWith(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main();
}