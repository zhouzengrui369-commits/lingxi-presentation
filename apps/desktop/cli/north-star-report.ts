/**
 * cli:north-star-report — T-4.1 北极星 10 次 demo 验证 汇总报告
 * 灵犀演示 · Phase 4 · Gate 4
 *
 * 读取 record-dir 下的 per-run JSON + aggregate.json，生成 docs/north_star_validation.md。
 *
 * 用法：
 *   node --experimental-strip-types apps/desktop/cli/north-star-report.ts \
 *     --record-dir /tmp/north_star_metrics \
 *     --output docs/north_star_validation.md
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { AggregateMetrics, RunMetrics } from './north-star.ts';

function parseArgs(argv: string[]): { recordDir: string; output: string; runsDir?: string } {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    }
  }
  return {
    recordDir: out['record-dir'] || '/tmp/north_star_metrics',
    output: out.output || 'docs/north_star_validation.md',
    runsDir: out['runs-dir'],
  };
}

function fmtMs(ms: number): string {
  return `${ms.toLocaleString()}ms`;
}

function fmtMb(mb: number): string {
  return `${mb}MB`;
}

function fmtBytes(b: number): string {
  if (b === 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function renderTable(agg: AggregateMetrics): string {
  const rows: string[] = [];
  rows.push('| run | success | retry | preview_html (ms) | advisor (ms) | memory (MB) | pptx | pdf | docx | html |');
  rows.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of agg.runs) {
    rows.push(
      `| ${pad2(r.run_num)} | ${r.success ? '✓' : '✗'} | ${r.retry_attempted ? '1' : '0'} | ${r.preview_html_latency_ms} | ${r.advisor_latency_ms} | ${r.memory_peak_mb} | ${fmtBytes(r.formats.pptx.size_bytes)} | ${fmtBytes(r.formats.pdf.size_bytes)} | ${fmtBytes(r.formats.docx.size_bytes)} | ${fmtBytes(r.formats.html.size_bytes)} |`,
    );
  }
  return rows.join('\n');
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function gate(g: boolean): string {
  return g ? '✓' : '✗';
}

function renderGates(agg: AggregateMetrics): string {
  return [
    `| 1. 10/10 成功（每次完整 demo 走通，无随机失败） | ${gate(agg.prd_gates.success_rate_10_of_10)} | success_rate = ${agg.success_count}/${agg.total_runs} = ${(agg.success_rate * 100).toFixed(1)}% |`,
    `| 2. 平均 HTML 预览延迟 ≤ 10s | ${gate(agg.prd_gates.preview_html_avg_under_10s)} | avg = ${fmtMs(agg.avg_preview_html_latency_ms)} (max ${fmtMs(agg.max_preview_html_latency_ms)}) |`,
    `| 3. 平均 AI 响应延迟 ≤ 3s | ${gate(agg.prd_gates.advisor_avg_under_3s)} | avg = ${fmtMs(agg.avg_advisor_latency_ms)} (max ${fmtMs(agg.max_advisor_latency_ms)}) |`,
    `| 4. 资源占用 ≤ 8G 内存 | ${gate(agg.prd_gates.memory_under_8g)} | max = ${fmtMb(agg.max_memory_peak_mb)} |`,
  ].join('\n');
}

export function renderMarkdown(agg: AggregateMetrics, opts: {
  inputDir: string;
  outputDir: string;
  daemonPort: number;
  screenshotDir?: string;
  recordDir: string;
  platform: string;
  notes?: string[];
}): string {
  const lines: string[] = [];
  lines.push('# 灵犀演示 — 北极星 10 次 demo 验证报告');
  lines.push('');
  lines.push(`> T-4.1 · Phase 4 · Gate 4 · Plan-Id: T-4.1-macos-north-star`);
  lines.push(`> 平台: **${opts.platform}**`);
  lines.push(`> 生成时间: ${agg.generated_at}`);
  lines.push(`> 输入目录: ${opts.inputDir}`);
  lines.push(`> 输出目录: ${opts.outputDir}`);
  lines.push(`> Daemon 端口: ${opts.daemonPort}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. 北极星指标');
  lines.push('');
  lines.push('**完成 1 次"季度汇报 PPT 端到端 demo"的成功率 = 100%，重复 10 次零失败**（goal.md §5）');
  lines.push('');
  lines.push(`- 跑批次数: **${agg.total_runs}**`);
  lines.push(`- 成功次数: **${agg.success_count}**`);
  lines.push(`- 成功率: **${(agg.success_rate * 100).toFixed(1)}%**`);
  lines.push('');
  lines.push('## 2. 10 次 run 详细数据');
  lines.push('');
  lines.push(renderTable(agg));
  lines.push('');
  lines.push('## 3. 汇总指标');
  lines.push('');
  lines.push(`| 指标 | 数值 | 阈值 | 状态 |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| 平均总耗时 | ${fmtMs(agg.avg_total_duration_ms)} | n/a | info |`);
  lines.push(`| 平均 HTML 预览延迟 | ${fmtMs(agg.avg_preview_html_latency_ms)} | ≤ 10,000ms | ${gate(agg.avg_preview_html_latency_ms <= 10_000)} |`);
  lines.push(`| 最大 HTML 预览延迟 | ${fmtMs(agg.max_preview_html_latency_ms)} | n/a | info |`);
  lines.push(`| 平均 AI 顾问响应延迟 | ${fmtMs(agg.avg_advisor_latency_ms)} | ≤ 3,000ms | ${gate(agg.avg_advisor_latency_ms <= 3_000)} |`);
  lines.push(`| 最大 AI 顾问响应延迟 | ${fmtMs(agg.max_advisor_latency_ms)} | n/a | info |`);
  lines.push(`| 最大内存峰值 | ${fmtMb(agg.max_memory_peak_mb)} | ≤ 8,192MB | ${gate(agg.max_memory_peak_mb <= 8 * 1024)} |`);
  lines.push('');
  lines.push('## 4. 4 格式输出文件 size 汇总');
  lines.push('');
  lines.push(`| 格式 | 平均 size | 最小 size | 成功率 |`);
  lines.push(`|---|---|---|---|`);
  for (const fmt of ['pptx', 'pdf', 'docx', 'html']) {
    lines.push(`| .${fmt} | ${fmtBytes(agg.format_avg_sizes[fmt])} | ${fmtBytes(agg.format_min_sizes[fmt])} | ${(agg.format_ok_rate[fmt] * 100).toFixed(1)}% |`);
  }
  lines.push('');
  lines.push('## 5. PRD 硬指标门卡（line 359-368 逐项）');
  lines.push('');
  lines.push(renderGates(agg));
  lines.push('');
  lines.push('## 6. 截图清单');
  lines.push('');
  if (opts.screenshotDir) {
    lines.push(`路径: \`${opts.screenshotDir}/\``);
    lines.push('');
    for (let i = 1; i <= agg.total_runs; i++) {
      const r = agg.runs.find((x) => x.run_num === i);
      if (!r) continue;
      const note = r.success ? '✓ PASS' : `✗ FAIL (${r.fail_reason?.slice(0, 80) ?? 'unknown'})`;
      lines.push(`- \`${opts.screenshotDir}/run_${pad2(i)}.png\` — run ${pad2(i)} ${note}`);
    }
    lines.push(`- \`${opts.screenshotDir}/summary_dashboard.png\` — 汇总仪表盘`);
  } else {
    lines.push('_未生成（screenshots dir 未指定）_');
  }
  lines.push('');
  lines.push('## 7. 平台标注');
  lines.push('');
  lines.push(`- 本次验证仅覆盖 **${opts.platform} half**`);
  lines.push('- Win half 待 NJX 拍 Win VM SKU 后启动 Phase 4 Win half sub-plan');
  lines.push('');
  if (opts.notes && opts.notes.length > 0) {
    lines.push('## 8. 备注');
    lines.push('');
    for (const n of opts.notes) {
      lines.push(`- ${n}`);
    }
    lines.push('');
  }
  lines.push('## 9. 验收信号（line 359-368 逐项）');
  lines.push('');
  lines.push(`- [${gate(agg.prd_gates.success_rate_10_of_10)}] 10 次 demo 全部成功（每次都走完整流程）`);
  lines.push(`- [${gate(agg.prd_gates.success_rate_10_of_10)}] 10 次结果稳定（无随机失败）`);
  lines.push(`- [${gate(agg.prd_gates.preview_html_avg_under_10s)}] 平均 HTML 预览延迟 ≤ 10s`);
  lines.push(`- [${gate(agg.prd_gates.advisor_avg_under_3s)}] 平均 AI 响应延迟 ≤ 3s`);
  lines.push(`- [${gate(agg.prd_gates.memory_under_8g)}] 资源占用 ≤ 8G`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`## VERDICT: ${agg.verdict}`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 读 aggregate.json
  const aggPath = path.join(args.recordDir, 'aggregate.json');
  const aggRaw = await fs.readFile(aggPath, 'utf-8');
  const agg = JSON.parse(aggRaw) as AggregateMetrics;

  // 拼出输入/输出/截图/daemon 信息（从 aggregate 拿不到，从 args.runsDir 推断）
  const outputDir = args.runsDir || '/tmp/north_star';

  const md = renderMarkdown(agg, {
    inputDir: 'apps/desktop/testdata/quarterly_review',
    outputDir,
    daemonPort: agg.runs[0]?.daemon_port ?? 0,
    screenshotDir: 'screenshots/T-4.1-north-star',
    recordDir: args.recordDir,
    platform: 'macOS half (Win half 等 NJX 拍 VM SKU)',
  });

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, md, 'utf-8');

  console.log(`[north-star-report] 报告生成: ${args.output}`);
  console.log(`[north-star-report] VERDICT: ${agg.verdict}`);
  console.log(`[north-star-report] 成功 ${agg.success_count}/${agg.total_runs} | avg_preview=${agg.avg_preview_html_latency_ms}ms | avg_advisor=${agg.avg_advisor_latency_ms}ms | max_memory=${agg.max_memory_peak_mb}MB`);
}

// 仅当直接执行本文件时才跑 main()
const _invokedDirectly = process.argv[1] && (
  process.argv[1].endsWith('north-star-report.ts') ||
  process.argv[1].endsWith('north-star-report.js')
);

if (_invokedDirectly) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(99);
  });
}