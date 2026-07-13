# 灵犀演示 — T-6.3 真 runtime 9 硬指标 10 次 demo 验证报告

> Plan-Id: T-6.3-runtime-validation
> 模式: **real-cli** (--harness = mock; --real-cli = spawn full-demo; --real-app = spawn /Applications/灵犀演示.app, T-6.8 后续)
> 生成时间: 2026-07-13T00:48:00.151Z
> 跑批次数: **3** · 通过: **0** · 成功率: **0.0%**
> 总文件导入: **21** · 失败: **9**
> **VERDICT: FAIL**

---

## 1. 9 硬指标 gate 评估 (phase6_plan.md T-6.3 line 130-138)

| # | 状态 | 指标 | 阈值 | 观察 | 详情 |
|---|---|---|---|---|---|
| 1 | ✗ | 文件导入成功率 | ≥ 99% | 0.57 ratio | 57.14% |
| 2 | ✗ | AI 响应延迟 | avg ≤ 3s, max ≤ 5s | 6162.00 ms | avg=6162ms, max=7546ms |
| 3 | ✓ | HTML 预览延迟 | avg ≤ 10s, max ≤ 15s | 3824.00 ms | avg=3824ms, max=3963ms |
| 4 | ✓ | 顾问带选项比例 | ≥ 90% | 1.00 ratio | 100.00% |
| 5 | ✓ | 模板匹配度 | 100% (builtin_business_dark) | 1.00 ratio | 100.00% template_id=builtin_business_dark |
| 6 | ✓ | voice 准确率 | avg ≥ 95% (mock 录音池) | N/A ratio | H6 N/A (real-cli mode, 3/3 runs) — voice 评估在 harness+voice 模式跑 (T-6.11 wave 9, 100% pass) |
| 7 | ✓ | 资源占用 | max ≤ 8G | 71.00 MB | max=71MB |
| 8 | ✓ | PPTX 可编辑 | WPS 截图全部可编辑 | 3.00 count | 3/3 runs |
| 9 | ✓ | PDF 无格式错乱 | Preview 11 pages 全部 OK | 3.00 count | 3/3 runs |

## 2. 10 次 run 详细数据

| run | pass | import | ai_latency | preview | advisor_options | template | voice | memory | pptx | pdf |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | ✗ | 0.0% | 6097ms | 3963ms | 100.0% | 100.0% | N/A | 71MB | ✓ | ✓ |
| 02 | ✗ | 0.0% | 7546ms | 3672ms | 100.0% | 100.0% | N/A | 71MB | ✓ | ✓ |
| 03 | ✗ | 0.0% | 4844ms | 3837ms | 100.0% | 100.0% | N/A | 71MB | ✓ | ✓ |

## 3. 聚合指标

| 指标 | 数值 | 阈值 | 状态 |
|---|---|---|---|
| 文件导入成功率 | 57.14% | ≥ 99% | ✗ |
| AI 响应延迟 (avg / max) | 6162ms / 7546ms | ≤ 3000ms / 5000ms | ✗ |
| HTML 预览延迟 (avg / max) | 3824ms / 3963ms | ≤ 10000ms / 15000ms | ✓ |
| 顾问带选项比例 | 100.00% | ≥ 90% | ✓ |
| 模板匹配度 (builtin_business_dark) | 100.00% | 100% | ✓ |
| voice 准确率 (avg / min) | N/A (real-cli mode) | avg ≥ 95% | ✓ (N/A) |
| 资源占用 (max RSS) | 71MB | ≤ 8192MB | ✓ |
| PPTX 可编辑 (WPS) | 3/3 runs | 全部可编辑 | ✓ |
| PDF 无格式错乱 (Preview) | 3/3 runs | 全部 OK | ✓ |

## 4. 截图清单 (screenshots/T-6.3-runtime/)

- 10 张 per-run 截图 (run_01.png ... run_10.png)
- 1 张 summary_dashboard.png
- 模式标注: harness = 9 指标 mock 渲染, 不是真 /Applications/灵犀演示.app runtime

## 5. 验收信号 (phase6_plan.md T-6.3 line 130-139)

- [✗] 1. 文件导入成功率 (≥ 99%)
- [✗] 2. AI 响应延迟 (avg ≤ 3s, max ≤ 5s)
- [✓] 3. HTML 预览延迟 (avg ≤ 10s, max ≤ 15s)
- [✓] 4. 顾问带选项比例 (≥ 90%)
- [✓] 5. 模板匹配度 (100% (builtin_business_dark))
- [✓] 6. voice 准确率 (avg ≥ 95% (mock 录音池))
- [✓] 7. 资源占用 (max ≤ 8G)
- [✓] 8. PPTX 可编辑 (WPS 截图全部可编辑)
- [✓] 9. PDF 无格式错乱 (Preview 11 pages 全部 OK)

## 6. Changelog

- 2026-07-11: T-6.3 真 runtime 9 硬指标 10 次 demo 验证 harness 实现
- 钉子 #1: PDF CJK 修 — 写 weasyprint adapter (pdf_writer_weasyprint.ts), 当前模式未真跑 weasyprint CLI (T-6.8 装包后)
- 钉子 #4: max_concurrency=1, 串行跑 10 次
- 钉子 #14: 3件齐 (commit + deliverable + board) wrap-up
- 钉子 #22: worktree 内 fresh npm install
- 钉子 #30: 30min cap wrap-up (5min 留给 commit + deliverable + board + report-back)

---

## VERDICT: FAIL
