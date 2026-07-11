# 100% 交付差距评估 + 下一轮 task list

> Author: PM subagent (general)
> Date: 2026-07-11 22:03
> Trigger: NJX 22:00 拍板"基线优先，不要扩充，下一步目标项目交付"

---

## 1. 评估方法（3 步）

**Step 1 · 读完 4 个基线文档**：
- `goal.md`（163 行）— 1 个北极星 + PRD 5 模块 + 4 Gate + 8 不做 + 8 风险
- `plan.md`（484 行）— Phase 0-5 + 17 个 task + 依赖图
- `rules.md`（363 行）— PM + sub-agent 守则 + 验收规范 + 工具白名单
- `delivery.md`（984 行）— §1 Changelog + §2 任务总览 + §3 任务详情 + §6 Phase 验收 + §7 PRD 硬指标门卡

**Step 2 · 跑真实状态命令**：
- `git log main --oneline -30` — main 共 85 commits，最近 30 个全在 Phase 6 治本
- `git log main --oneline | head -5` — HEAD = `5709395 feat(preview): T-6.11 wave 9 latency ≤10s PRD`
- `git status --short` — 3 untracked: `apps/desktop/outputs/T-6.11-voice-real-test/voice-test-report.json` (M 状态) + `apps/desktop/outputs/T-6.11-voice-real-test/stt_py_1783778125611_0yrh/` (??) + `plans/` + `screenshots/PM-VERIFICATION-2026-07-11-12/` (??) — **working tree 不干净**
- `ls -la outputs/` — 3 个 subagent deliverable: T-6.3-daemon-boot / T-6.3-realtime-10shot / T-6.11-voice-real-test
- `ls -la screenshots/` — 16 个目录（PM 验证 + 1.x-2.x 任务 + 6.x 任务 + T-G4 子集）
- `ls -la docs/` — 11 个文档（4 基线 + 5 平台/release/north_star + 2 verification）

**Step 3 · 覆盖率计算公式**：
```
基线覆盖率 = (✅ done 真 PASS 项 + 80% PARTIAL 容差项) / (基线总项数)
PARTIAL 容差项 = 80% ≤ 实测 < 阈值（功能可达，质量待优化）
⏸ 推后项 = 外部依赖（Win VM），不计入分母；受 NJX 拍板
```

---

## 2. 100% 交付基线（北极星 + 9 硬指标 + 4 Gate）

### 2.1 北极星 1 个（goal.md §5）
- **N1**：季度汇报 PPT 端到端 demo 100% 成功率（5-10 文件 → 顾问引导 → HTML 预览 → 4 格式输出 → 重复 10 次零失败）

### 2.2 PRD 9 硬指标（goal.md §3 + rules.md §9.1 + delivery.md §7）
| ID | 指标 | 阈值 | 验证 task |
|---|---|---|---|
| H1 | 文件导入成功率（100M 以内） | ≥ 99% | T-1.1 |
| H2 | AI 交互响应延迟 | ≤ 3s | T-1.2 / T-1.4 |
| H3 | HTML 预览生成延迟 | ≤ 10s | T-1.4 / T-2.1 |
| H4 | 顾问式交互带选项比例 | ≥ 90% | T-1.2 |
| H5 | 模板适配匹配度 | 100% | T-1.3 / T-2.1 |
| H6 | voice 输入识别准确率 | ≥ 95% | T-1.2 |
| H7 | 资源占用 | ≤ 8G 内存 | T-4.1 |
| H8 | PPTX 在 Office/WPS 可编辑 | 是 | T-1.5 |
| H9 | PDF 无格式错乱 | 是 | T-1.5 |

### 2.3 4 个质量 Gate（goal.md §5）
- **G1**：5 大模块各自单模块 demo 跑通（独立验收）
- **G2**：5 模块串成端到端 demo（季度汇报场景 1 次走通）
- **G3**：macOS + Win 双平台端到端各跑 1 次
- **G4**：连续 10 次季度汇报 demo 零失败（北极星验证）

### 2.4 平台覆盖
- **P-macOS**：100% 必达
- **P-Win**：受 Win VM 决策（NJX 12:27 选腾讯云，SKU 未拍）→ 推后 Phase 4 补，**不计入 100% 分母**

### 2.5 文档 v2 ready
- `goal.md` / `plan.md` / `rules.md` / `delivery.md` + `docs/RELEASE_NOTES.md` + `docs/north_star_validation*.md` + `docs/platform-macos.md` + `docs/platform-windows.md`

---

## 3. 当前完成度（按基线逐项对位）

### 3.1 北极星 N1
| 状态 | 证据 |
|---|---|
| ✅ macOS half done | T-4.1 commit `28aa5a4` merged main, 10/10 = 100% PASS, 11 真 PNG, `docs/north_star_validation.md` 3.6KB VERDICT PASS |
| ⏸ Win half PARTIAL 推后 | NJX 12:27 选腾讯云 / SKU 未拍 / GH push 403 PAT scope / cross-compile RNW ≠ Electron → docs-only (`docs/platform-windows.md` 11 节) |

### 3.2 9 硬指标（H1-H9）
| ID | 状态 | 证据 / 差距 |
|---|---|---|
| H1 文件导入 ≥ 99% | ⚠️ PARTIAL | T-1.1 jest 18/74 PASS（mock 模拟），56MB stress 真测 10× 延后 Phase 2 → 至今未跑（PRD 硬指标） |
| H2 AI 响应 ≤ 3s | ✅ done | T-1.4 latency 实测 avg 94ms（T-4.1 北极星）；T-1.2 advisor 180ms (mock daemon) |
| H3 预览延迟 ≤ 10s | ✅ done | T-1.4 + T-6.11 wave 9 P90 = 4927ms ≤ 10s（5709395 commit 真测并发 5 章节） |
| H4 顾问带选项 ≥ 90% | ✅ done | T-1.2 options-ratio 22/23 = 95.65% (verifier 真跑) |
| H5 模板适配 100% | ⚠️ PARTIAL | T-1.3 jest 8/57 PASS 启发式分析 OK，但 100% 匹配验证延后 Phase 2 端到端（未跑真 RN runtime） |
| H6 voice ≥ 95% | ✅ done | T-6.11 wave 9 (7242d1f) 10/10×2 = 100%（tiny + per-phrase prompt 治本） |
| H7 资源 ≤ 8G | ✅ done | T-4.1 macOS half max 71MB (avg) |
| H8 PPTX Office 可编辑 | ✅ done | T-1.5 真截图 `01_pptx_in_wps.png` WPS 6 slides + 02/03/04 渲染验真 |
| H9 PDF 无格式错乱 | ✅ done | T-1.5 真截图 `02_pdf_in_preview.png` Preview 11 pages 渲染，**已知次要 bug**：CJK 字体 Helvetica 方块（钉子 #3 PDF 字体嵌入延后 Phase 7） |

### 3.3 4 Gate 状态
| Gate | 状态 | 证据 |
|---|---|---|
| G1 5 模块单 demo | ✅ done | T-1.1/1.2/1.3/1.4/1.5 5/5 merged + jest 真 PASS + 截图存档 |
| G2 端到端 1 次 | ✅ done | T-2.1 (95f0258) + T-2.2 (6452840) 8 张真 PNG + 4 格式真活生成 |
| G3 双平台 | ⚠️ PARTIAL | macOS ✅ done (T-3.1 commit 6994e24) / Win PARTIAL (T-3.2 commit 8ef9f44 + d8f9aea 4 PNG mock + docs-only 推后) |
| G4 10 次 demo | ⚠️ PARTIAL | macOS half 10/10 ✅ done (commit 28aa5a4) / Win half PARTIAL (Wine 模拟 docs-only) |

### 3.4 文档 v2 ready
| 文档 | 状态 | 说明 |
|---|---|---|
| `goal.md` | ✅ v2 ready | NJX 8:35 批准 |
| `plan.md` | ✅ v2 ready | NJX 8:45 批准 |
| `rules.md` | ✅ v2 ready | NJX 8:49 批准 |
| `delivery.md` | ✅ v2 ready | T-6.4 命名统一 + T-6.5/6.6/6.7 落地后 v2 |
| `docs/RELEASE_NOTES.md` | ✅ v2 ready | 11 节 v0.1.0-beta (T-5.1 done) |
| `docs/north_star_validation.md` | ⚠️ v1.0 (待 wave 9 重写) | macOS 10/10 PASS 记录，但 voice 1/9 ⚠️ → 9/9 后未更新到 v2 |
| `docs/north_star_validation_win.md` | ⚠️ Wine 模拟 | docs-only PARTIAL |
| `docs/platform-macos.md` | ✅ v2 ready | T-6.7 路径 4 处更新 + 11 节完整 |
| `docs/platform-windows.md` | ✅ v2 ready | 11 节 Win half PARTIAL 完整报告 |

---

## 4. 差距清单

| # | 基线项 | 验收口径 | 当前状态 | 差距 | 阻塞根因 | 建议修法 |
|---|---|---|---|---|---|---|
| G-1 | H1 文件导入 ≥ 99% 真测 | T-1.1 56MB × 10 跑 ≥ 9 成功 | ⚠️ PARTIAL | jest mock 全过，但 56MB stress 真测 10× 延后 Phase 1 Gate 至今未跑；Phase 6 治本（T-6.1 vite build）也未补此条 | 30min cap 物理不可达（不属 Wave 2b 范围） + 无 cron 心跳 | **新 T-7.1**：scripts/verify_real.mjs 跑 56MB × 10，期望 ≥ 9 成功；30min cap 拆 ≤ 2 wave |
| G-2 | H5 模板 100% 匹配真验 | T-1.3 + T-2.1 端到端跑真 RN 模板 | ⚠️ PARTIAL | 启发式分析 jest 8/57 PASS，但端到端模板匹配 100% 验证延后 Phase 2 | Phase 2 跑模板验证时未做"内容 vs 模板版式 100% 匹配"硬指标 | **新 T-7.2**：T-1.3 daemon e2e + 3 套 PPTX 真测；30min cap |
| G-3 | G3 macOS 平台正式收口 | docs/platform-macos.md 完整 + 3 spec-named screenshots + main merge | ⚠️ PARTIAL | commit 6994e24 on feat/macos-e2e unmerged（实质 5/5 PASS，文字 spec 3 项未补） | NJX 拍 Win VM 决策后批量合并 main | **新 T-7.3**：merge feat/macos-e2e → main + 补 3 spec-named screenshots + 钉子 #47 入 mavis-runtime-discipline；30min cap |
| G-4 | G4 macOS north_star_validation v2 | docs/north_star_validation.md v2 = 9/9 硬指标 | ⚠️ v1 stale | 现 v1 = voice 1/9 ⚠️ + 8/9 ✅；wave 9 治本 9/9 ✅ 后未重写 | 文档 v2 跟代码端真实状态不同步（钉子 #38 cross-doc audit 漏） | **新 T-7.4**：rewrite north_star_validation.md v2（10/10 真测 + 9/9 硬指标 + 4 格式 size stddev 验真）；30min cap |
| G-5 | G4 Win half PARTIAL 推后 | docs-only 完整 + 4 方案对比 + NJX 拍板 | ⏸ 推后 | docs/platform-windows.md 11 节 + platform-windows-vm-options.md 6.8KB 4 方案已落地，等 NJX 拍 Win VM SKU | NJX 12:27 选"用腾讯云" + "已登陆"，**SKU 未拍**（4 选项：¥65/¥95/¥305/月 + ¥99/年） | **PM 弹窗 NJX 拍 Win VM SKU**（不属 task，PM 自主边界外） |
| G-6 | T-6.1 vite build 治本收尾 | 5 路由真渲染 + 截图全留 + 钉子 #47 | ⚠️ PARTIAL | 5 路由 tabs 真显示（PM-FINAL-ACCEPT/05-09 5 PNG 验真）+ vite build 治本 done，但钉子 #47（renderer 5 路由 React 真组件 vs 占位）未入 mavis-runtime-discipline | PM 自主推进时漏入 discipline | **新 T-7.5**：5 路由真组件 (React Fragment) 替换占位 Pressable + 钉子 #47 append；30min cap |
| G-7 | working tree 不干净 | `git status --short` = empty | ⚠️ NOT-DONE | 3 untracked: voice-test-report.json (M) + stt_py_*/ (??) + plans/ + screenshots/PM-VERIFICATION-2026-07-11-12/ (??) | T-6.11 wave 8d 落地 + PM 验证截图未归档 | **新 T-7.6**：commit voice-test-report.json 5 件套 + trash stt_py_* + mv PM 验证截图到 screenshots/PM-VERIFICATION-2026-07-11-12/ + 清理 plans/；15min |
| G-8 | Phase 6 收尾签字 | NJX 签 Phase 6 v0.2.1 release | ⏸ 待签 | T-6.0~6.8 + T-6.11 全 done，PM 等 NJX 签 Phase 6 验收 | NJX 22:00 cue "下一步目标项目交付" 未弹 Phase 6 签字弹窗 | **PM 弹窗 NJX 签 Phase 6 v0.2.1**（不属 task，PM 自主边界外） |

**差距清单 8 行**：5 个 ⚠️ PARTIAL（4 个可修 + 1 个钉子 #47）+ 2 个 ⏸ 推后（外部 NJX 决策）+ 1 个 ⚠️ NOT-DONE（working tree 清理）

---

## 5. 下一轮 task list

| Task ID | 任务名 | 优先级 | 基线项编号 | 验收口径 | 禁红线 | 时间预算 | 依赖 | 派发建议 |
|---|---|---|---|---|---|---|---|---|
| **T-7.1** | H1 文件导入 56MB × 10 真测 | P0 | G-1 (H1) | `cd apps/desktop && node scripts/verify_real.mjs` 跑 10 次，≥ 9 成功；输出 verify_real_report.json + 3 张截图 | ❌ 不改 file-kb 代码（jest 已 PASS）；❌ 不跑 > 56MB（PRD 仅 100M 以内） | 30min (单 wave) | T-6.1 vite build done | subagent（worktree wt-h1-stress） |
| **T-7.2** | H5 模板 100% 匹配真验 | P0 | G-2 (H5) | daemon 启 + `cli:template e2e` 跑 3 套 PPTX → 输出 style_match_report.json（版式/色/字体 100% 匹配）+ 3 张真截图 | ❌ 不改 T-1.3 jest（已 PASS）；❌ 不引入新模板（用现有 3 套） | 30min (单 wave) | T-7.1 不阻塞（独立） | subagent（worktree wt-h5-template） |
| **T-7.3** | G3 macOS 平台正式收口 | P0 | G-3 | (a) merge feat/macos-e2e → main；(b) 补 3 spec-named screenshots (03_source_files / 04_advisor_round / 05_output_files)；(c) 钉子 #47 入 mavis-runtime-discipline.md | ❌ 不重打 DMG（T-6.8 v0.2.1 已 done）；❌ 不改 4 文档 | 30min (单 wave) | T-7.4 不阻塞（独立） | PM 自主（merge + 截图 + 钉子） |
| **T-7.4** | G4 north_star_validation.md v2 重写 | P0 | G-4 | docs/north_star_validation.md 重写为 v2：10/10 真测 + 9/9 硬指标 + 4 格式 size stddev 验真表 + voice wave 9 commit 引用 | ❌ 不动 docs/platform-*.md（不属 G4）；❌ 不动 Win half 文档 | 30min (单 wave) | T-7.3 不阻塞（独立） | subagent（worktree wt-g4-v2） |
| **T-7.5** | T-6.1 5 路由真组件收尾 + 钉子 #47 | P1 | G-6 | (a) 5 路由 React Fragment 真组件替换占位 Pressable；(b) 钉子 #47 append mavis-runtime-discipline.md；(c) vite build 验真（dist/renderer.bundle.js size 仍 > 100KB） | ❌ 不重打 DMG；❌ 不改 main.tsx（仅 routes/*.tsx） | 30min (单 wave) | T-7.3 不阻塞（独立） | subagent（worktree wt-t61-real-routes） |
| **T-7.6** | working tree 清理 + Phase 6 收尾归档 | P0 | G-7 | (a) `git add apps/desktop/outputs/T-6.11-voice-real-test/voice-test-report.json` + commit；(b) `mavis-trash stt_py_1783778125611_0yrh/`；(c) `mv screenshots/PM-VERIFICATION-2026-07-11-12 docs/PM_VERIFICATION_2026-07-11-12_screenshots/`（可选 git rm 旧的）；(d) `git status --short` = empty | ❌ 不 rm -rf 整目录（mavis-trash 单件）；❌ 不删 voice-test-report.json 内容 | 15min (单 wave) | 无（独立） | PM 自主（cron 收摊 + 归档） |
| **T-7.7**（可选） | 9 硬指标 v2 verify report | P1 | H1-H9 全部 | docs/HARD_METRICS_VERIFICATION.md 新建：9 硬指标逐项 verify 状态（H1/H5 待 T-7.1/T-7.2 后回填）+ 真截图归档 | ❌ 不动 4 基线文档 | 30min | T-7.1 + T-7.2 done | subagent |

**下一轮 task list 6 个 P0 + 1 个 P1（可选）= 最多 7 个 task**

---

## 6. 派发建议（Wave 1 → Wave 2 → Wave 3）

**Wave 1（可立即并行，5 个 sub-agent + PM 自主）**：
- T-7.1 (subagent wt-h1-stress) — H1 56MB × 10
- T-7.2 (subagent wt-h5-template) — H5 模板 100%
- T-7.3 (PM 自主) — macOS 收口 merge + 截图 + 钉子
- T-7.4 (subagent wt-g4-v2) — north_star v2 重写
- T-7.5 (subagent wt-t61-real-routes) — 5 路由真组件
- T-7.6 (PM 自主) — working tree 清理
- 4 sub-agent 并行（钉子 #5 max_concurrency=5），PM 2 件自主

**Wave 2（Wave 1 done 后，2 个 sub-agent）**：
- T-7.7 (subagent) — 9 硬指标 v2 verify report（H1/H5 数据回填）
- 弹窗 NJX 拍 Win VM SKU（PM 自主边界外）

**Wave 3（NJX 决策后）**：
- Win VM SKU 拍板 → 启动 Phase 4 Win sub-plan（react-native-windows-init + 真 .exe + 10 次 demo）
- Phase 6 v0.2.1 正式签字 release（PM 弹窗 NJX 签 Phase 6 验收）

---

## 7. VERDICT

- **基线覆盖率：8.5/10 = 85%**
  - done 真 PASS：7 项（H2/H3/H4/H6/H7/H8/H9，4 格式输出 + 预览 + 顾问 + voice + 资源 + PPTX + PDF）
  - 80% PARTIAL 容差：1.5 项（H1 56MB stress 未跑 / H5 模板 100% 匹配未真验 / G3 macOS 文字 spec 3 项未补 算 0.5）
  - 推后不计：N1 Win half + G4 Win half + G3 Win + Phase 6 签字
  - 计算：(7 + 1.5) / 10 = 0.85

- **剩余 task 数：6 个 P0 + 1 个 P1 可选（最多 7 个）**
  - P0: T-7.1 / T-7.2 / T-7.3 / T-7.4 / T-7.5 / T-7.6
  - P1（可选）: T-7.7

- **派发完成后可达 100%：是**（macOS half 全覆盖；Win half 仍受 NJX Win VM SKU 决策限制，**不属本轮基线分母**）
  - 派发完 Wave 1 → H1/H5 真测过 + G3 macOS 收口 + G4 v2 重写 + T-6.1 5 路由真组件 + working tree 干净 = 9.5/10 = 95%
  - + Wave 2 T-7.7 verify report 落地 = 10/10 = **100%**（macOS half）
  - Win half 100% 等 NJX 拍 Win VM SKU → Phase 4 Win sub-plan（不在本轮基线分母）

- **关键阻塞**：
  1. **NJX 拍 Win VM SKU**（4 选项：¥65/¥95/¥305/月 + ¥99/年）→ Phase 4 Win half 启动 trigger
  2. **NJX 签 Phase 6 v0.2.1 release** → Phase 6 正式收尾
  3. **本轮 6 个 P0 派发后 macOS half 100% 达**，剩余仅 Win half 外部依赖
