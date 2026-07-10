# 灵犀演示 — 北极星 10 次 demo 验证报告

> T-4.1 · Phase 4 · Gate 4 · Plan-Id: T-4.1-macos-north-star
> 平台: **macOS half (Win half 等 NJX 拍 VM SKU)**
> 生成时间: 2026-07-10T07:49:45.877Z
> 输入目录: apps/desktop/testdata/quarterly_review
> 输出目录: /tmp/north_star
> Daemon 端口: 65030

---

## 1. 北极星指标

**完成 1 次"季度汇报 PPT 端到端 demo"的成功率 = 100%，重复 10 次零失败**（goal.md §5）

- 跑批次数: **10**
- 成功次数: **10**
- 成功率: **100.0%**

## 2. 10 次 run 详细数据

| run | success | retry | preview_html (ms) | advisor (ms) | memory (MB) | pptx | pdf | docx | html |
|---|---|---|---|---|---|---|---|---|---|
| 01 | ✓ | 0 | 102 | 99 | 71 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 02 | ✓ | 0 | 102 | 92 | 71 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 03 | ✓ | 0 | 113 | 76 | 70 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 04 | ✓ | 0 | 152 | 73 | 71 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 05 | ✓ | 0 | 90 | 83 | 71 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 06 | ✓ | 0 | 109 | 72 | 70 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 07 | ✓ | 0 | 113 | 114 | 70 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 08 | ✓ | 0 | 101 | 80 | 70 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 09 | ✓ | 0 | 109 | 91 | 71 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 10 | ✓ | 0 | 212 | 157 | 71 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |

## 3. 汇总指标

| 指标 | 数值 | 阈值 | 状态 |
|---|---|---|---|
| 平均总耗时 | 2,313ms | n/a | info |
| 平均 HTML 预览延迟 | 120ms | ≤ 10,000ms | ✓ |
| 最大 HTML 预览延迟 | 212ms | n/a | info |
| 平均 AI 顾问响应延迟 | 94ms | ≤ 3,000ms | ✓ |
| 最大 AI 顾问响应延迟 | 157ms | n/a | info |
| 最大内存峰值 | 71MB | ≤ 8,192MB | ✓ |

## 4. 4 格式输出文件 size 汇总

| 格式 | 平均 size | 最小 size | 成功率 |
|---|---|---|---|
| .pptx | 71.6 KB | 71.6 KB | 100.0% |
| .pdf | 6.3 KB | 6.3 KB | 100.0% |
| .docx | 9.2 KB | 9.2 KB | 100.0% |
| .html | 4.1 KB | 4.1 KB | 100.0% |

## 5. PRD 硬指标门卡（line 359-368 逐项）

| 1. 10/10 成功（每次完整 demo 走通，无随机失败） | ✓ | success_rate = 10/10 = 100.0% |
| 2. 平均 HTML 预览延迟 ≤ 10s | ✓ | avg = 120ms (max 212ms) |
| 3. 平均 AI 响应延迟 ≤ 3s | ✓ | avg = 94ms (max 157ms) |
| 4. 资源占用 ≤ 8G 内存 | ✓ | max = 71MB |

## 6. 截图清单

路径: `screenshots/T-4.1-north-star/`

- `screenshots/T-4.1-north-star/run_01.png` — run 01 ✓ PASS
- `screenshots/T-4.1-north-star/run_02.png` — run 02 ✓ PASS
- `screenshots/T-4.1-north-star/run_03.png` — run 03 ✓ PASS
- `screenshots/T-4.1-north-star/run_04.png` — run 04 ✓ PASS
- `screenshots/T-4.1-north-star/run_05.png` — run 05 ✓ PASS
- `screenshots/T-4.1-north-star/run_06.png` — run 06 ✓ PASS
- `screenshots/T-4.1-north-star/run_07.png` — run 07 ✓ PASS
- `screenshots/T-4.1-north-star/run_08.png` — run 08 ✓ PASS
- `screenshots/T-4.1-north-star/run_09.png` — run 09 ✓ PASS
- `screenshots/T-4.1-north-star/run_10.png` — run 10 ✓ PASS
- `screenshots/T-4.1-north-star/summary_dashboard.png` — 汇总仪表盘

## 7. 平台标注

- 本次验证仅覆盖 **macOS half (Win half 等 NJX 拍 VM SKU) half**
- Win half 待 NJX 拍 Win VM SKU 后启动 Phase 4 Win half sub-plan

## 9. 验收信号（line 359-368 逐项）

- [✓] 10 次 demo 全部成功（每次都走完整流程）
- [✓] 10 次结果稳定（无随机失败）
- [✓] 平均 HTML 预览延迟 ≤ 10s
- [✓] 平均 AI 响应延迟 ≤ 3s
- [✓] 资源占用 ≤ 8G

---

## VERDICT: PASS
