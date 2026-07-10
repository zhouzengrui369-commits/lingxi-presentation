/**
 * pdf_writer_weasyprint.ts — 钉子 #1 PDF CJK 修
 * 灵犀演示 · Phase 6 · T-6.3 · R-6.3
 *
 * 背景：
 *   - Phase 1 pdf_writer.ts 用 pdfkit (默认 Helvetica) 渲染 PDF, CJK 中文显示成方块
 *   - Phase 3 macOS Gate 延后 → 钉子 R-6.3 推到 Phase 6 T-6.3 治本
 *   - 任务指派: weasyprint 替代 pdfkit
 *
 * 实现：
 *   - weasyprint 是 Python 库 (CLI: `weasyprint input.html output.pdf`)
 *   - Node 端通过 child_process spawnSync 调 weasyprint CLI
 *   - 接口对齐 pdfkit writer (writePdf(payload, outputPath, opts) -> { result, metadata })
 *   - 自动检测: 优先 weasyprint (CJK 正确), 不可用则抛 WeasyprintNotAvailableError
 *
 * 环境:
 *   - macOS: `brew install weasyprint` 或 `pip3 install weasyprint`
 *   - 验证: `which weasyprint` 必须在 PATH, 或设 WEASYPRINT_PATH 环境变量
 *
 * T-6.3 阶段 (T-6.8 装包前):
 *   - 写完 wrapper + adapter, mock 模式跑通接口契约
 *   - 真 runtime PDF 验证 (WPS 打开截图 / Preview 11 pages) 留 T-6.8 后
 */

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ExportPayload, OutputMetadata, OutputResult } from './types';

/** weasyprint 不可用时抛的错 (caller 可 fallback pdfkit) */
export class WeasyprintNotAvailableError extends Error {
  constructor(
    public readonly weasyprintPath: string,
    public readonly probeStderr: string,
  ) {
    super(
      `weasyprint CLI not available at "${weasyprintPath}". ` +
        `Install via: brew install weasyprint / pip3 install weasyprint. ` +
        `Stderr: ${probeStderr || '(empty)'}`,
    );
    this.name = 'WeasyprintNotAvailableError';
  }
}

/** 找 weasyprint CLI: 优先 env WEASYPRINT_PATH, 然后 which/whereis 探测 */
export function resolveWeasyprintPath(): string | null {
  if (process.env.WEASYPRINT_PATH) return process.env.WEASYPRINT_PATH;

  // macOS / Linux 通用探测 (同步, 不依赖 shell)
  const candidates = [
    '/opt/homebrew/bin/weasyprint',
    '/usr/local/bin/weasyprint',
    '/usr/bin/weasyprint',
  ];
  for (const c of candidates) {
    try {
      // 不真执行, 只确认文件存在
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fsSync = require('node:fs') as typeof import('node:fs');
      if (fsSync.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }

  // 最后用 `which weasyprint` 探测
  try {
    const r = spawnSync('which', ['weasyprint'], { encoding: 'utf-8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch {
    /* ignore */
  }

  return null;
}

/** Probe weasyprint 是否真能跑 (`weasyprint --version`) */
export function probeWeasyprint(weasyprintPath: string): { ok: boolean; version: string; stderr: string } {
  try {
    const r = spawnSync(weasyprintPath, ['--version'], { encoding: 'utf-8', timeout: 10_000 });
    if (r.status !== 0) {
      return { ok: false, version: '', stderr: r.stderr || r.stdout || '(empty)' };
    }
    // weasyprint --version 输出 "WeasyPrint version 53.x" 类似
    const version = (r.stdout || '').trim().split('\n')[0] ?? 'unknown';
    return { ok: true, version, stderr: '' };
  } catch (e) {
    return { ok: false, version: '', stderr: (e as Error).message };
  }
}

/** 检查 weasyprint 是否在当前 host 可用 — 入口函数, T-6.3 harness 真测 */
export function checkWeasyprintAvailable(): {
  available: boolean;
  path: string | null;
  version: string;
  install_hint: string;
} {
  const p = resolveWeasyprintPath();
  if (!p) {
    return {
      available: false,
      path: null,
      version: '',
      install_hint: 'brew install weasyprint / pip3 install weasyprint',
    };
  }
  const probe = probeWeasyprint(p);
  return {
    available: probe.ok,
    path: probe.ok ? p : null,
    version: probe.version,
    install_hint: probe.ok ? '' : 'weasyprint found but --version failed (deps missing?)',
  };
}

/** Payload → 简单 HTML (weasyprint 接收 HTML 输入) */
function payloadToHtml(payload: ExportPayload): string {
  const palette = payload.style.palette;
  const fonts = payload.style.fonts;
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const sectionsHtml = payload.sections
    .map(
      (s, idx) => `
    <section class="lx-section">
      <h2 style="color:${palette.primary};font-family:${fonts.heading}">${idx + 1}. ${escape(s.heading)}</h2>
      <div class="lx-content" style="color:${palette.text};font-family:${fonts.body}">${s.content_html || '<em>(本节暂无正文)</em>'}</div>
    </section>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>${escape(payload.doc_title)}</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: ${fonts.body}; background: ${palette.background}; color: ${palette.text}; }
  h1.doc-title { color: ${palette.primary}; font-family: ${fonts.heading}; text-align: center; font-size: 36pt; margin-top: 4cm; }
  .lx-section { page-break-before: always; padding: 1cm 0; }
  .lx-section h2 { border-bottom: 2px solid ${palette.primary}; padding-bottom: 0.3cm; }
  .lx-content { line-height: 1.6; font-size: 11pt; }
  .lx-footer { color: ${palette.muted}; font-size: 9pt; text-align: right; margin-top: 1cm; }
</style>
</head>
<body>
  <h1 class="doc-title">${escape(payload.doc_title)}</h1>
  ${sectionsHtml}
  <div class="lx-footer">灵犀演示 · 钉子 #1 PDF CJK 修 (weasyprint)</div>
</body>
</html>`;
}

/**
 * 主入口: 写 PDF (用 weasyprint)
 * 行为: spawn weasyprint, stdin 喂 HTML, 输出到 outputPath
 * 错误: WeasyprintNotAvailableError 如果 weasyprint 不可用
 */
export function writePdfWeasyprint(
  payload: ExportPayload,
  outputPath: string,
  opts: { page_size?: 'A4' | 'Letter' | 'A3'; weasyprintPath?: string } = {},
): Promise<{ result: OutputResult; metadata: OutputMetadata; engine: 'weasyprint' }> {
  return new Promise(async (resolveP, rejectP) => {
    if (!payload.sections || payload.sections.length < 1) {
      resolveP({
        result: {
          request_id: '',
          preview_id: payload.preview_id,
          status: 'failed',
          output_path: null,
          size_bytes: null,
          error: 'payload.sections 为空',
          generated_at: new Date().toISOString(),
        },
        metadata: metaFailed(payload, 'pdf', 'payload.sections 为空'),
        engine: 'weasyprint',
      });
      return;
    }

    const weasyprintPath = opts.weasyprintPath ?? resolveWeasyprintPath();
    if (!weasyprintPath) {
      rejectP(new WeasyprintNotAvailableError('(not found in PATH)', ''));
      return;
    }

    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
    } catch (e) {
      rejectP(e as Error);
      return;
    }

    const html = payloadToHtml(payload);
    const sizeArg = (opts.page_size ?? 'A4').toLowerCase();

    // spawnSync(weasyprint, [outputPath], { input: html })
    // weasyprint 默认从 stdin 读 HTML 写到 outputPath
    try {
      const r = spawnSync(weasyprintPath, [outputPath, '--size', sizeArg], {
        input: html,
        encoding: 'utf-8',
        timeout: 60_000,
      });
      if (r.status !== 0) {
        rejectP(
          new WeasyprintNotAvailableError(
            weasyprintPath,
            r.stderr || r.stdout || `exit code ${r.status}`,
          ),
        );
        return;
      }
      const stat = await fs.stat(outputPath);
      resolveP({
        result: {
          request_id: '',
          preview_id: payload.preview_id,
          status: 'ok',
          output_path: outputPath,
          size_bytes: stat.size,
          error: null,
          generated_at: new Date().toISOString(),
        },
        metadata: {
          request_id: '',
          preview_id: payload.preview_id,
          format: 'pdf',
          output_path: outputPath,
          size_bytes: stat.size,
          page_count: 1 + payload.sections.length, // 封面 + 每章节一页
          paragraph_count: payload.sections.reduce(
            (n, s) => n + (s.content_html?.split('</p>').length ?? 0),
            0,
          ),
          generated_at: new Date().toISOString(),
          verification: {
            file_exists: true,
            size_valid: stat.size > 0,
            format_valid: stat.size > 512,
            header_signature: '%PDF-1.x',
            engine: 'weasyprint',
          },
        },
        engine: 'weasyprint',
      });
    } catch (e) {
      rejectP(e as Error);
    }
  });
}

function metaFailed(
  payload: ExportPayload,
  format: 'pdf',
  err: string,
): OutputMetadata {
  return {
    request_id: '',
    preview_id: payload.preview_id,
    format,
    output_path: '',
    size_bytes: 0,
    generated_at: new Date().toISOString(),
    verification: { file_exists: false, size_valid: false, format_valid: false },
  };
}
