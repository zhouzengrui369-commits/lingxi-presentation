/**
 * cli:full-demo — T-2.2 PM 端到端 demo orchestrator
 * 灵犀演示 · Phase 2 · T-2.2
 *
 * 流程：
 *   1. file_kb: 导入 testdata/quarterly_review/ 下 5-10 文件 → LLM Wiki
 *   2. advisor: 3 轮问询（带选项）— 演示顾问交互能力
 *   3. template: 选 1 个模板 (cli:template)
 *   4. preview: 生成 HTML 预览 (cli:preview)
 *   5. output:  生成 4 格式输出 (cli:export × pptx/pdf/docx/html)
 *
 * 用法：
 *   node --experimental-strip-types cli/full-demo.ts \
 *     --input apps/desktop/testdata/quarterly_review \
 *     --output /tmp/quarterly_demo_output
 *
 * 设计：所有子步骤都用现有 CLI / 模块 API，不绕过任何生产路径。
 *
 * 【W2 fail-closed】关键改动:
 *   - 任一 step 返回 fell_back=true / provider=mock|unavailable / content="hello (mock)" → 整体 FAIL
 *   - 任一 step status=partial → 整体 FAIL
 *   - 任一 阈值失败 → 整体 FAIL
 *   - 失败时 exit=1 且 不打印 "DEMO 全程通过" 字样
 *   - 显式 --allow-mock 标志允许 silent mock (smoke test only)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { performance } from 'perf_hooks';

import { FileKbManager } from '../src/modules/file_kb/manager.ts';
import { SCENARIO_TEMPLATES } from '../src/modules/advisor/questions.ts';
import { dispatchExport, verifyOutputFile, toExportPayload } from '../src/modules/output/format_router.ts';
import type { OutputFormat } from '../src/modules/output/types.ts';
import { desktopDir, tsxBin, mapTemplateToStyle } from './paths.ts';  // T-6.10: 共享路径解析 + template style 适配器
import type { TemplateStyle } from '../src/modules/preview/types.ts';
type QuestionTemplate = (typeof SCENARIO_TEMPLATES)[number]['questions'][number];

// ---- Args ----

function parseArgs(argv: string[]): { input: string; output: string; allowMock: boolean } {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    }
  }
  const input = out.input || 'apps/desktop/testdata/quarterly_review';
  const output = out.output || '/tmp/quarterly_demo_output';
  // 【W2】显式 --allow-mock 标志, 默认 false (fail-closed)
  const allowMock = out['allow-mock'] === 'true' || out['allow-mock'] === '1';
  return { input, output, allowMock };
}

// ---- Daemon probe ----

function daemonBaseUrl(): string {
  const port = process.env.LINGXI_DAEMON_PORT;
  if (!port) throw new Error('LINGXI_DAEMON_PORT not set');
  return `http://127.0.0.1:${port}`;
}

async function probeDaemon(): Promise<{ port: number; healthy: boolean; providers: string[]; status: string; available: boolean; activeProvider: string }> {
  const base = daemonBaseUrl();
  const port = parseInt(process.env.LINGXI_DAEMON_PORT!, 10);
  try {
    const r = await fetch(`${base}/v1/health`);
    const data = (await r.json()) as any;
    return {
      port,
      healthy: r.ok,  // 【W2】HTTP 200 = connected, 不管 status 字段 (degraded 也算 connected)
      providers: data.providers ?? [],
      status: data.status ?? 'unknown',
      available: data.available ?? false,
      activeProvider: data.active_provider ?? 'unknown',
    };
  } catch {
    return { port, healthy: false, providers: [], status: 'unreachable', available: false, activeProvider: 'unknown' };
  }
}

// ---- Run shell command, capture stdout ----

function run(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  const proc = spawnSync(cmd, args, {
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: 'utf-8',
    timeout: 60_000,
  });
  return {
    status: proc.status ?? -1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  };
}

// ---- Main pipeline ----

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();

  const pipelineLog: Array<{ step: string; status: string; data?: unknown; ms?: number }> = [];

  // 【W2 fail-closed】错误聚合器: 收集所有 fail-closed 触发原因
  const failReasons: string[] = [];

  const checkFailClosed = (stepName: string, check: {
    fellBack?: boolean;
    provider?: string;
    content?: string;
    providerStatus?: string;
    partial?: boolean;
  }): void => {
    if (check.fellBack === true) {
      failReasons.push(`[${stepName}] fell_back=true (LLM 调用降级, 非真活)`);
    }
    if (check.provider === 'mock' || check.provider === 'unavailable') {
      failReasons.push(`[${stepName}] provider=${check.provider} (无真活 provider, silent mock 路径)`);
    }
    if (check.providerStatus === 'mock' || check.providerStatus === 'unavailable') {
      failReasons.push(`[${stepName}] provider_status=${check.providerStatus} (daemon 上报非真活)`);
    }
    if (check.content === 'hello (mock)') {
      failReasons.push(`[${stepName}] content="hello (mock)" (silent mock 字符串, 非真 LLM 输出)`);
    }
    if (check.partial === true) {
      failReasons.push(`[${stepName}] status=partial (步骤部分失败)`);
    }
  };

  // ---- Step 0: Daemon probe ----
  console.log('\n[0/5] 探测 daemon ...');
  const daemon = await probeDaemon();
  console.log(`      daemon port=${daemon.port} status=${daemon.status} available=${daemon.available} active_provider=${daemon.activeProvider} providers=${daemon.providers.join(',')}`);
  // 【W2】区分 connected vs healthy:
  // - daemon.healthy = HTTP 200 connected (能调通)
  // - daemon.available = daemon 上报有真活 provider
  // 仅在 daemon 完全连不上 (HTTP error) 时 abort, fail-closed (degraded) 走后续 fail-closed 检测
  if (!daemon.healthy) {
    throw new Error('daemon unhealthy — abort. Start with: python -m backend.daemon.server');
  }
  // 【W2】daemon degraded 标记 fail-closed 触发原因, 但不立即 abort
  if (daemon.status === 'degraded' || !daemon.available) {
    failReasons.push(`[daemon_probe] daemon degraded: status=${daemon.status} available=${daemon.available} active_provider=${daemon.activeProvider}`);
  }
  pipelineLog.push({ step: 'daemon_probe', status: daemon.available ? 'ok' : 'partial', data: daemon });

  // ---- Step 1: file_kb import ----
  console.log('\n[1/5] file_kb: 导入季度汇报源文件 ...');
  const inputAbs = path.resolve(args.input);
  const kbRoot = path.join('/tmp', 'lingxi_demo_kb');
  await fs.rm(kbRoot, { recursive: true, force: true }).catch(() => {});
  const mgr = new FileKbManager({ kbRoot });
  await mgr.init();
  const step1Start = performance.now();
  const batch = await mgr.importPaths([inputAbs], { forceLocalWiki: true });
  const step1Ms = Math.round(performance.now() - step1Start);
  console.log(`      导入文件: ${batch.files.length}`);
  console.log(`      wiki 条目: ${batch.entries.length}`);
  console.log(`      失败: ${batch.failed.length}`);
  for (const f of batch.files) {
    console.log(`        - ${f.name}  status=${f.status}  size=${f.size_bytes}B`);
  }
  for (const e of batch.entries) {
    console.log(`        wiki: ${e.title}  tags=[${e.tags.join(', ')}]`);
  }
  // 【W2】file_kb 失败不视为 fail-closed (file_kb 是本地, 不是 LLM)
  // 但 partial 状态仍记 failReasons (跟原来 W1 行为一致: partial = 部分失败, 应 fail-closed)
  const step1Partial = batch.failed.length > 0;
  checkFailClosed('file_kb_import', { partial: step1Partial });
  pipelineLog.push({
    step: 'file_kb_import',
    status: batch.failed.length === 0 ? 'ok' : 'partial',
    data: { files: batch.files.length, entries: batch.entries.length, failed: batch.failed.length, kb_root: kbRoot },
    ms: step1Ms,
  });

  // ---- Step 2: advisor (3 rounds, 并行调 LLM) ----
  // T-MVP-2 v2 治本: 3 轮串行 → 并行 (Promise.all), 每轮都调一次 LLM
  //   串行总耗时 = sum(t1, t2, t3) ≈ 3 * 1.5s = 4.5s (超 5s max)
  //   并行总耗时 = max(t1, t2, t3) ≈ 1.5s (单 round 最慢时间)
  // 测试时 --no-cache 清空 cache, 测真 LLM 延迟, 不再用 prewarm 测 cache hit 作弊
  console.log('\n[2/5] advisor: 3 轮顾问交互 (并行调 LLM) ...');
  // 取 quarterly_review 场景的前 3 个问题，模拟用户选第一个选项
  const qrScenario = SCENARIO_TEMPLATES.find(s => s.scenario_id === 'quarterly_review');
  if (!qrScenario) throw new Error('quarterly_review scenario not found');
  const advisorQuestions = qrScenario.questions.slice(0, 3) as QuestionTemplate[];
  const step2Start = performance.now();
  const advisorLog: Array<{ round: number; question: string; options: string[]; picked: string; chat_provider: string; chat_provider_status: string; chat_elapsed_ms: number; chat_fell_back: boolean }> = [];

  // 3 轮问题 log 准备 (同步, 不调 LLM)
  const roundPayloads = advisorQuestions.map((q, i) => {
    const picked = q.option_templates?.[0]?.label ?? q.option_templates?.[0]?.value ?? '(none)';
    console.log(`      Round ${i + 1}: ${q.text}`);
    console.log(`        选项: ${(q.option_templates ?? []).map(o => o.label).join(' | ')}`);
    console.log(`        选: ${picked}`);
    // 每轮构造一个针对该问题的 LLM prompt, 模拟真顾问交互 (3 次独立 LLM call)
    const prompt = `顾问第 ${i + 1} 轮: 主题=${q.text}, 用户选=${picked}. 请基于此推荐 1 个章节大纲要点.`;
    return { round: i + 1, question: q.text, options: (q.option_templates ?? []).map(o => o.label), picked, prompt };
  });

  // 并行发起 3 次 LLM call (Promise.all) — 真治本
  const chatResults = await Promise.all(
    roundPayloads.map((p) =>
      fetch(`${daemonBaseUrl()}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: p.prompt }),
      }).then(async (r) => {
        // 【W2 fail-closed】非 2xx → 立即记 fail
        if (!r.ok) {
          let body: any = null;
          try { body = await r.json(); } catch { /* ignore */ }
          return { ok: false, status: r.status, data: body, httpError: true };
        }
        const data = (await r.json()) as any;
        return { ok: true, status: r.status, data };
      }),
    ),
  );

  for (let i = 0; i < roundPayloads.length; i++) {
    const p = roundPayloads[i];
    const cr = chatResults[i];
    const provider = cr?.data?.provider ?? 'unknown';
    const providerStatus = cr?.data?.provider_status ?? 'unknown';
    const fellBack = cr?.data?.fell_back ?? false;
    const elapsed = cr?.data?.elapsed_ms ?? 0;
    const content = cr?.data?.content ?? '';
    console.log(`      Round ${p.round} LLM: provider=${provider} status=${providerStatus} fell_back=${fellBack} elapsed_ms=${elapsed.toFixed(2)} content_chars=${content.length}`);
    advisorLog.push({ round: p.round, question: p.question, options: p.options, picked: p.picked, chat_provider: provider, chat_provider_status: providerStatus, chat_elapsed_ms: elapsed, chat_fell_back: fellBack });
    // 【W2 fail-closed】任一 advisor round 失败 → 整个 advisor 步骤 fail
    if (cr.httpError || !cr.ok) {
      failReasons.push(`[advisor Round ${p.round}] HTTP ${cr.status} (daemon 返错, 非真活): ${JSON.stringify(cr.data)}`);
    } else {
      checkFailClosed(`advisor Round ${p.round}`, {
        fellBack,
        provider,
        content,
        providerStatus,
      });
    }
  }

  const step2Ms = Math.round(performance.now() - step2Start);
  // H2 latency = step2Ms (3 round 并行总耗时 = max(t1,t2,t3) ≈ 单 round 时间)
  // 比串行 sum(t1+t2+t3) 降 ~3x
  // 【W2】advisor 步骤有 fail-closed 触发 → 标 partial 让全 pipeline 看到
  const advisorHasFail = advisorLog.some(r => r.chat_fell_back || r.chat_provider === 'mock' || r.chat_provider === 'unavailable' || r.chat_provider_status === 'mock' || r.chat_provider_status === 'unavailable');
  pipelineLog.push({
    step: 'advisor_3_rounds',
    status: advisorHasFail ? 'partial' : 'ok',
    data: {
      rounds: advisorLog.length,
      picked: advisorLog.map(r => r.picked),
      daemon_chat_provider: advisorLog[0]?.chat_provider,
      daemon_chat_provider_status: advisorLog[0]?.chat_provider_status,
      per_round_fell_back: advisorLog.map(r => r.chat_fell_back),
      per_round_provider: advisorLog.map(r => r.chat_provider),
      per_round_provider_status: advisorLog.map(r => r.chat_provider_status),
      parallel: true,
      per_round_elapsed_ms: advisorLog.map(r => r.chat_elapsed_ms),
    },
    ms: step2Ms,
  });

  // ---- Step 3: template selection ----
  console.log('\n[3/5] template: 选择模板 ...');
  // 用 builtin dark 主题（不走 PPTX 提取 — Phase 1 cli.ts 的 extract_pptx.py 路径有 bug，
  //   而且我们 venv python 路径未注入 cli.ts 的 findPython。builtin 是同等的 MVP 验证路径）
  // T-6.10: desktopDir 从 './paths.ts' 导入（不再用 process.cwd()）— 这样从 repo root 跑也能定位 apps/desktop/
  const templateInput = path.join(desktopDir, 'testdata/templates/business-dark.pptx');
  const templateOutputJson = path.join('/tmp', 'lingxi_template_business-dark.json');
  const step3Start = performance.now();
  const tpl = run(tsxBin, ['src/modules/template/cli.ts', '--input', templateInput, '--output', templateOutputJson, '--builtin', 'dark'], {
    cwd: desktopDir,
    env: { LINGXI_DAEMON_PORT: process.env.LINGXI_DAEMON_PORT!, PATH: `${path.join(desktopDir, 'node_modules/.bin')}:${process.env.PATH ?? ''}` },
  });
  const step3Ms = Math.round(performance.now() - step3Start);
  console.log(`      template cli: status=${tpl.status}`);
  console.log(`      ${tpl.stdout.trim().split('\n').join('\n      ')}`);
  if (tpl.status !== 0) {
    console.error('      stderr:', tpl.stderr);
    throw new Error(`template cli failed: status=${tpl.status}`);
  }
  const tplData = JSON.parse(await fs.readFile(templateOutputJson, 'utf-8'));
  console.log(`      template_id: ${tplData.template_style.template_id}`);
  console.log(`      palette.primary: ${tplData.template_style.palette?.primary}`);
  console.log(`      layout_types: ${tplData.template_style.layout_types?.join(', ')}`);
  // T-6.10: 适配 template style → TemplateStyle (5 字段 → 6 字段)，后面 preview + 4-format export 都用这份
  const templateStyle: TemplateStyle = mapTemplateToStyle(tplData.template_style);
  console.log(`      adapted palette.primary: ${templateStyle.palette.primary}`);
  console.log(`      adapted palette.background: ${templateStyle.palette.background}`);
  console.log(`      adapted fonts.heading: ${templateStyle.fonts.heading}`);
  pipelineLog.push({
    step: 'template_select',
    status: 'ok',
    data: { template_id: tplData.template_style.template_id, palette: tplData.template_style.palette, layout_types: tplData.template_style.layout_types, source: 'builtin', adapted: { primary: templateStyle.palette.primary, background: templateStyle.palette.background, heading: templateStyle.fonts.heading } },
    ms: step3Ms,
  });

  // ---- Step 4: preview (HTML) ----
  console.log('\n[4/5] preview: 生成 HTML 预览 ...');
  const previewOutDir = path.join(args.output, 'previews');
  await fs.mkdir(previewOutDir, { recursive: true });
  // T-6.10: 把适配后的 template style 序列化到 tmp, --style 让 preview renderer 真的用上模板配色
  const styleJsonPath = path.join('/tmp', 'lingxi_template_style.json');
  await fs.writeFile(styleJsonPath, JSON.stringify(templateStyle, null, 2), 'utf-8');
  const step4Start = performance.now();
  const preview = run('node', ['cli/preview.ts', '--prompt', '灵犀演示 Q1 2026 季度汇报', '--out', previewOutDir, '--style', styleJsonPath], {
    cwd: desktopDir,
  });
  const step4Ms = Math.round(performance.now() - step4Start);
  console.log(`      preview cli: status=${preview.status} stdout_lines=${preview.stdout.split('\n').length}`);
  if (preview.status !== 0) {
    console.error('      stderr:', preview.stderr);
    throw new Error(`preview cli failed: status=${preview.status}`);
  }
  // preview.ts 在最后写一个完整 JSON object (前面有 '---JSON---' 标记)
  // 【W6 治本】之前 rfind('{', lastBrace) 找到的是 nested object 的 '{', 不是 root JSON
  // 现在改: 用 '---JSON---' 标记定位 root JSON 起点, 然后用 lastIndexOf('}') 找终点
  const previewOut = preview.stdout;
  const jsonMarker = '---JSON---';
  const markerIdx = previewOut.lastIndexOf(jsonMarker);
  let previewJson: any;
  if (markerIdx !== -1) {
    // 标记后第一个 '{' 是 root JSON 起点
    const afterMarker = previewOut.slice(markerIdx + jsonMarker.length);
    const firstBrace = afterMarker.indexOf('{');
    const lastBrace = afterMarker.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      console.error('      preview stdout:', preview.stdout);
      throw new Error(`preview JSON parse failed: cannot locate JSON braces (marker found at ${markerIdx})`);
    }
    try {
      previewJson = JSON.parse(afterMarker.slice(firstBrace, lastBrace + 1));
    } catch (e) {
      console.error('      preview stdout:', preview.stdout);
      throw new Error(`preview JSON parse failed: ${(e as Error).message}`);
    }
  } else {
    // 兜底: 找最后完整 {...} 块 (v3 逻辑, 但已知有 bug, 仅兼容无 marker 的旧 preview.ts)
    const lastBrace = previewOut.lastIndexOf('}');
    const firstBrace = previewOut.lastIndexOf('{', lastBrace);
    try {
      previewJson = JSON.parse(previewOut.slice(firstBrace, lastBrace + 1));
    } catch (e) {
      console.error('      preview stdout:', preview.stdout);
      throw new Error(`preview JSON parse failed (fallback): ${(e as Error).message}`);
    }
  }
  const previewHtmlPath = previewJson.html_path;
  console.log(`      preview_id: ${previewJson.preview_id}`);
  console.log(`      latency_ms: ${previewJson.latency_ms}  under_10s=${previewJson.under_10s}`);
  console.log(`      html_path: ${previewHtmlPath}`);
  // 【W2 fail-closed】preview 阶段检测: fell_back, mock provider, partial
  checkFailClosed('preview_generate', {
    fellBack: previewJson.fell_back,
    provider: previewJson.provider,
    providerStatus: previewJson.provider_status,
    partial: !previewJson.under_10s,
  });
  pipelineLog.push({
    step: 'preview_generate',
    status: previewJson.under_10s ? (previewJson.fell_back ? 'partial' : 'ok') : 'partial',
    data: { preview_id: previewJson.preview_id, latency_ms: previewJson.latency_ms, under_10s: previewJson.under_10s, html_path: previewHtmlPath, provider: previewJson.provider, fell_back: previewJson.fell_back, provider_status: previewJson.provider_status },
    ms: step4Ms,
  });

  // ---- Step 5: export 4 formats ----
  console.log('\n[5/5] output: 生成 4 格式输出 ...');
  const outputDir = path.resolve(args.output);
  await fs.mkdir(outputDir, { recursive: true });
  const formats = ['pptx', 'pdf', 'docx', 'html'] as OutputFormat[];

  // 从 preview HTML 解析 sections（与 cli/export.ts 等价）
  const sourceHtml = await fs.readFile(previewHtmlPath, 'utf-8');
  function extractSections(html: string): Array<{ heading: string; content_html: string; image_urls: string[] }> {
    const sections: Array<{ heading: string; content_html: string; image_urls: string[] }> = [];
    const re = /<section class="lx-section"[^>]*>([\s\S]*?)<\/section>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const block = m[1];
      const headingMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
      const contentMatch = block.match(/<div class="lx-content"[^>]*>([\s\S]*?)<\/div>/);
      const imgMatches = [...block.matchAll(/<img[^>]+src="([^"]+)"/g)];
      sections.push({
        heading: headingMatch ? headingMatch[1].replace(/<[^>]+>/g, '').trim() : '(未命名章节)',
        content_html: contentMatch ? contentMatch[1] : '',
        image_urls: imgMatches.map(x => x[1]),
      });
    }
    return sections;
  }
  const sections = extractSections(sourceHtml);
  const titleMatch = sourceHtml.match(/<h1 class="lx-doc-title"[^>]*>([\s\S]*?)<\/h1>/);
  const docTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : sections[0]?.heading ?? '灵犀演示季度汇报';
  const previewId = 'pm-demo';
  // T-6.10: 把 template style 传给 4-format export (PPTX/PDF/DOCX/HTML) — 之前传 undefined 导致配色全部走默认蓝
  const payload = toExportPayload({ preview_id: previewId, sections, html: sourceHtml }, templateStyle, docTitle);

  const exportResults: Record<string, any> = {};
  const step5Start = performance.now();
  for (const fmt of formats) {
    const outFile = path.join(outputDir, `Q1_2026_季度汇报.${fmt}`);
    const requestId = `pm-demo-${Date.now()}-${fmt}`;
    const startedAt = Date.now();
    try {
      const { result, metadata } = await dispatchExport({
        request: { request_id: requestId, preview_id: previewId, format: fmt, output_path: outFile, options: null },
        sourceHtml,
        payload,
      });
      const elapsedMs = Date.now() - startedAt;
      const verify = verifyOutputFile(fmt, outFile);
      const fileStat = await fs.stat(outFile).catch(() => null);
      exportResults[fmt] = {
        status: result.status,
        size_bytes: fileStat?.size ?? 0,
        output_path: outFile,
        elapsed_ms: elapsedMs,
        verifier_ok: verify.ok,
        page_count: metadata.page_count,
        paragraph_count: metadata.paragraph_count,
      };
      console.log(`      .${fmt}: status=${result.status} size=${fileStat?.size ?? 0}B elapsed=${elapsedMs}ms page_count=${metadata.page_count} verifier_ok=${verify.ok}`);
    } catch (e) {
      const elapsedMs = Date.now() - startedAt;
      const fileStat = await fs.stat(outFile).catch(() => null);
      exportResults[fmt] = {
        status: 'failed',
        size_bytes: fileStat?.size ?? 0,
        output_path: outFile,
        elapsed_ms: elapsedMs,
        error: (e as Error).message,
      };
      console.log(`      .${fmt}: status=failed size=${fileStat?.size ?? 0}B error=${(e as Error).message}`);
    }
  }
  const step5Ms = Math.round(performance.now() - step5Start);
  const allOk = Object.values(exportResults).every((r: any) => r.status === 'ok' && r.size_bytes > 0);
  // 【W2】4 格式输出任何 partial 也记 fail (保留原 partial 标记)
  const outputHasPartial = Object.values(exportResults).some((r: any) => r.status !== 'ok' || r.size_bytes === 0);
  if (outputHasPartial) {
    failReasons.push(`[output_4_formats] 部分格式生成失败: ${JSON.stringify(exportResults, null, 2)}`);
  }
  pipelineLog.push({
    step: 'output_4_formats',
    status: allOk ? 'ok' : 'partial',
    data: exportResults,
    ms: step5Ms,
  });

  // ---- Summary ----
  const totalMs = Math.round(performance.now() - startedAt);
  // 【W2 fail-closed】summary.ok 由 failReasons 决定, 不是 W1 的 "all partial-OK" 逻辑
  const w2HasFail = failReasons.length > 0;
  const summary = {
    ok: !w2HasFail && allOk,
    total_ms: totalMs,
    daemon,
    input_dir: inputAbs,
    output_dir: outputDir,
    pipeline: pipelineLog,
    // 【W2】fail_reasons 让 verifier / PM 看到具体 fail-closed 触发
    fail_reasons: failReasons,
    fail_reason_count: failReasons.length,
    w2_allow_mock: args.allowMock,
  };
  await fs.writeFile(path.join(outputDir, 'demo-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n========= DEMO 总结 =========`);
  console.log(`  total: ${totalMs}ms`);
  console.log(`  ok: ${summary.ok}`);
  console.log(`  fail_reasons: ${failReasons.length}`);
  for (const r of failReasons) {
    console.log(`    - ${r}`);
  }
  console.log(`  output_dir: ${outputDir}`);
  console.log(`  summary: ${path.join(outputDir, 'demo-summary.json')}`);

  // 【W2 fail-closed】exit code:
  // - 0 = 全程真活, 无任何 fail-closed 触发
  // - 1 = fail-closed 触发, 但允许 silent mock (显式 --allow-mock)
  // - 2 = fail-closed 触发, 不允许 silent mock (默认)
  if (w2HasFail) {
    if (args.allowMock) {
      console.error(`DEMO fail-closed 触发 ${failReasons.length} 项, 但 --allow-mock 显式允许, exit 1`);
      process.exit(1);
    }
    console.error(`DEMO fail-closed 触发 ${failReasons.length} 项, 整体 FAIL, exit 2`);
    process.exit(2);
  }
  // 【W2】注意: 即便没 fail-closed, 如果 daemon degraded 或 step partial 也不算 PASS
  const summaryStrict = summary.ok;
  if (!summaryStrict) {
    console.error('DEMO 步骤部分失败 (status=partial 或 4 格式不全), 整体 FAIL, exit 1');
    process.exit(1);
  }
  console.log('DEMO 全程通过 ✓ (真活验证)');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});