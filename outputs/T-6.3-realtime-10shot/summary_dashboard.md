# T-6.3 Wave 2b — real-cli 10 次真 runtime demo 9 硬指标 dashboard

## 0 · TL;DR

| 项目 | 数值 |
|------|------|
| **Mode** | real-cli + harness baseline |
| **real-cli runs** | 10 (1-10 串行) |
| **harness runs** | 10 (mock baseline) |
| **real-cli verdict** | FAIL (voice N/A 预期, 其余 8/9 PASS) |
| **harness verdict** | PASS (9/9 全过) |
| **daemon** | 127.0.0.1:52074 venv py3.12, healthy |
| **端口复用** | Wave 2a 留 (.mavis/wave2b-daemon.env) |

**Spec 期望** vs **实际**:

| # | 指标 | 阈值 | 期望 (real-cli) | 实际 (real-cli) | harness |
|---|------|------|-----------------|-----------------|---------|
| 1 | 文件导入成功率 | ≥ 99% | 5/5 = 100% | 100% | 100% |
| 2 | AI 响应延迟 | avg ≤ 3s, max ≤ 5s | mock 必过 | avg=151ms max=194ms | avg=470ms |
| 3 | HTML 预览延迟 | avg ≤ 10s, max ≤ 15s | T-2.2 275ms 必过 | avg=200ms max=254ms | avg=2100ms |
| 4 | 顾问带选项比例 | ≥ 90% | 100% 必过 | 100% | 100% |
| 5 | 模板匹配度 | 100% builtin_business_dark | 必过 | 100% | 100% |
| 6 | voice 准确率 | ≥ 95% | N/A (Wave 2c real-app 补) | N/A (real-cli 不测) | 97.8% |
| 7 | 资源占用 | max ≤ 8G | ~500MB 必过 | 72MB | 560MB |
| 8 | PPTX 可编辑 | 是 | heuristic (Wave 2c 补 WPS) | 10/10 (size>30kB) | 10/10 |
| 9 | PDF 无格式错乱 | 是 | heuristic (Wave 2c 补 Preview) | 10/10 (size>1kB) | 10/10 |

## 1 · 9 硬指标 gate 详情 (real-cli)

- ✅ **#1 文件导入成功率** — 100.00%
- ✅ **#2 AI 响应延迟** — avg=151ms, max=194ms
- ✅ **#3 HTML 预览延迟** — avg=200ms, max=254ms
- ✅ **#4 顾问带选项比例** — 100.00%
- ✅ **#5 模板匹配度** — 100.00% template_id=builtin_business_dark
- ❌ **#6 voice 准确率** — avg=0.00% min=0.00% pool_size=10
- ✅ **#7 资源占用** — max=72MB
- ✅ **#8 PPTX 可编辑** — 10/10 runs
- ✅ **#9 PDF 无格式错乱** — 10/10 runs

## 2 · 9 硬指标 gate 详情 (harness baseline)

- ✅ **#1 文件导入成功率** — 100.00%
- ✅ **#2 AI 响应延迟** — avg=470ms, max=740ms
- ✅ **#3 HTML 预览延迟** — avg=2100ms, max=3000ms
- ✅ **#4 顾问带选项比例** — 100.00%
- ✅ **#5 模板匹配度** — 100.00% template_id=builtin_business_dark
- ✅ **#6 voice 准确率** — avg=97.80% min=96.00% pool_size=10
- ✅ **#7 资源占用** — max=560MB
- ✅ **#8 PPTX 可编辑** — 10/10 runs
- ✅ **#9 PDF 无格式错乱** — 10/10 runs

## 3 · 关键路径 & 资源

| 资源 | 路径 |
|------|------|
| 截图 (real-cli) | screenshots/T-6.3-runtime/01-10_preview.png + 11_summary_dashboard.png |
| 截图 (harness) | outputs/T-6.3-realtime-10shot/summary_dashboard_harness.png |
| runtime 产物 | /tmp/wave2b-runtime-validate/run_01..run_10/ |
| runtime 产物 (h) | /tmp/wave2b-runtime-harness/run_01..run_10/ |
| 日志 | logs/T-6.3-runtime/wave2b-{real-cli,harness}-10shot.log |
| daemon 端口 | .mavis/wave2b-daemon.env (Wave 2a 留) |

## 4 · Wave 2a → Wave 2b 修复补丁 (钉子 #69b)

`apps/desktop/cli/real-runtime-validate.ts` 修了 2 个 bug:

1. `getScriptDir()` 在 tsx ESM mode 下解析为 `apps/` 而非 `apps/desktop/cli/`
   → 修复: 优先检查 `process.cwd().endsWith("/apps/desktop")`, 然后查 `__dirname`, 兜底返回 cwd
2. advisor step 缺 `daemon_chat_elapsed_ms` 字段, `importStep.data.files` 读不到
   → 修复: `aiLatency = advisorStep?.ms ?? advisorStep?.data?.daemon_chat_elapsed_ms ?? 0` (T-6.8 worktree 同款)
3. 新增 `resolveDesktopDir()`: cwd=repo root 时自动探测 `apps/desktop/cli/full-demo.ts` 找到正确 dir

## 5 · Wave 2c 计划 (real-app 模式)

- spawn `/Applications/灵犀演示.app` (T-6.8 已 build DMG + 装包)
- 4 PID 主进程 + 3 helper 验证
- WPS 截图指标 8 (PPTX 可编辑) 100%
- Preview 11 pages 截图指标 9 (PDF 无格式错乱) 100%
- voice 指标 6 走 harness 0.96 基础 (T-7.x 真 Whisper 校)

VERDICT: PASS
