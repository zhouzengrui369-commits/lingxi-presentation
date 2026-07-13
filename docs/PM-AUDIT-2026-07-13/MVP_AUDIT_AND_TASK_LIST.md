# 灵犀演示 — MVP 收官战基线审计 + MVP 任务清单（PM 视角）

> **作者**: PM (Mavis) · 自审计（mavis CLI 沙箱拦截 SIGKILL 137，subagent 通道改走 PM 自主出 doc，跟钉子 #37 electron-builder Wine auto-provision 同根因）
> **生成时间**: 2026-07-13 10:18 (Asia/Shanghai)
> **触发**: NJX 10:10 prompt "派子智能体审计 → 我审 → 一次性出 MVP 任务清单 → 派子代理干活 → 验收"
> **基线**: goal.md §3 PRD 5 模块 + §5 北极星 + 4 Gate / plan.md Phase 0-7.5 / rules.md 9 节 / delivery.md 1056 行
> **方法**: 30s 三件套 (钉子 #38 strict-pwd-ls) + 5-min cross-doc audit (5/5 verify) + 4 文档 grep + git 50 commit + 23 截图目录/102 PNG + 7/12 AUDIT_REPORT.md (268 行) + 7/11 T-7.0 gap-assessment (185 行) + 7/13 W1 done (commit 79bd720 + 8e84952)
> **作者保证**: 不写代码 · 不改基线 · 不 mock · 不信 self-report · 不假装"已完成"

---

## 0 · VERDICT 一句话

**⚠️ PARTIAL · 整体 47.5%** — **macOS 9.5/10 收口待 H2 v3 (3d) + Win 0/10 卡 NJX 拍 Win VM SKU**；**距离 MVP 100% 实际差距 = 2 块硬骨头 (H2 v3 治本 + Win half) + 1 块软骨头 (文档 v0.3.0 收口) + 1 块清理 (working tree)**。

---

## 1 · 5-min cross-doc audit 验证（钉子 #38 SOP 实战 · ground truth）

| # | 检查项 | 真值 | 状态 |
|---|---|---|---|
| 1 | 4 基线文档 ready | goal.md 13151B (203 行) / plan.md 23261B (484 行) / rules.md 13971B (363 行) / delivery.md 79068B (1056 行) | ✅ |
| 2 | main HEAD | `0037856 docs(phase7.5): T-MVP-2 v3 baseline extension 立项 + goal.md changelog (NJX 9:30 拍板)` | ✅ |
| 3 | git log 最近 30 commits | 50 commits total, 最近 30 全在 Phase 6-7.5 治本 (T-6.11 wave 9 + T-7.1 H1 + T-7.2 H5 + Phase 7.5 W1) | ✅ |
| 4 | 截图目录 + PNG 数 | 24 目录 / 99 PNG (vs 7/12 audit 报 23/102, 净减少因 mavis-trash 清理) | ✅ |
| 5 | app bundle 状态 | `/Applications/灵犀演示.app` 装 (commit 7/11 10:00 T-6.8 v0.2.0 done, Info.plist CFBundleShortVersionString=0.2.0) | ✅ |
| 6 | daemon 状态 | 未跑 (pgrep 灵犀演示 = 空) — 待 5-min audit 启动真测 | ⚠️ |
| 7 | W1 实际状态 | feat/mvp-h2-v3 branch HEAD = `8e84952 docs(t-mvp-2-v3-w1): W1 deliverable.md + board.md append (T-MVP-2 v3 Wave 1 收口)`, 5 文件 spec 齐 (llm_provider_v3.md 29034B + provider_compat_matrix 5599B + provider_switch_ui 12158B + H2_THRESHOLD_REDEFINITION 8298B + llm_chat_streaming.schema 6700B) + verify_w1.sh 7/7 PASS + W2/W3 sub-plan yaml | ✅ |
| 8 | 现有审计 ground truth | 7/12 AUDIT_REPORT.md (268 行) + 7/11 T-7.0 gap-assessment (185 行) + 7/13 PM_VERIFICATION-2026-07-11-20 (8 PNG + verify-report.md) | ✅ |
| 9 | 4 文档一致性矩阵 | goal/plan/rules 内部一致 + delivery.md 陈旧 (T-6.11 row 7/11 14:20 旧状态) + phase6_plan.md 367 行 + phase7_v3_mvp_h2_v3_plan.md 223 行 | ⚠️ T-6.11 row 需补 wave 9 |
| 10 | 9 硬指标覆盖 | H1 100% (T-7.1) + H2 7164ms ⚠️ (待 W2/W3) + H3 4927ms ✅ (T-6.11 wave 9) + H4 95.65% ✅ (T-1.2) + H5 100% design-aware ✅ (T-7.2) + H6 100% ✅ (T-6.11 wave 9) + H7 71MB ✅ + H8 ✅ + H9 ✅ (CJK Helvetica 方块已知) | 8/9 ✅ + 1/9 ⚠️ |

**5-min audit 10 项 = 8 ✅ + 2 ⚠️**（daemon 未跑是预期，待启动真测；T-6.11 row 陈旧是 7/12 审计已发现 + 已纳入 MVP-3 task）

---

## 2 · 基线偏离 5 点（一针见血）

### 偏离 1 · H2 真治本方向错了（架构问题不是性能问题）

- **基线**: goal.md §3 H2 = "AI 交互响应延迟 ≤ 3s avg / ≤ 5s max"（full response 计时）
- **现状**: 7/13 真 LLM 实测 avg=7164ms / max=20101ms（超阈 2.4x/6.7x）— T-6.3 audit 跑出来
- **历史修法**: T-MVP-2 v1 (commit e18a1cb LRU cache 30s TTL, 7164ms→2ms 命中) + v2 (commit fe1e1f1 advisor 3 轮并行 + 移除 cache prewarm) — **都治标不治本**
- **根因**: **PRD 用 full response 计时但 LLM 实际推理时间不可压**（同 prompt 同模型 6-9s 不可变）
- **基线偏离**: 阈值语义需要升级（流式首 token 才是用户感知延迟）— **NJX 9:30 拍板"🅰 T-MVP-2 v3 全部"**（流式 + 多 provider + 用户切 UI + H2 重新定义）
- **距离 MVP**: Phase 7.5 W1 done (79bd720 5 文件 spec + 8e84952 W1 收口) + W2 (2d 流式+多 provider) + W3 (1d UI+阈值+验证) = **3 天** = **距离 100% 差 3d**

### 偏离 2 · Win half 100% 卡 NJX 拍 Win VM SKU（外部承诺/钱 PM 不可决策）

- **基线**: goal.md §6 Phase 3 双平台并行 (G3) + Phase 4 北极星 10 次双平台 (G4)
- **现状**: T-3.2 Win PARTIAL (commit 8ef9f44 + d8f9aea 4 PNG mock + docs-only) + T-G4-win Wine 模拟 PARTIAL
- **NJX 决策**: 7/10 12:27 选腾讯云 + 已登陆 + **SKU 未拍** (4 选项: ¥65/¥95/¥305/月 + ¥99/年, 详见 `docs/platform-windows-vm-options.md`)
- **基线偏离**: 整个 Win half 0% — **不是技术问题，是 NJX 没拍 SKU** = **PM 不可决策边界**
- **距离 MVP**: NJX 拍 SKU (5min) + react-native-windows-init (3d) + 真 .exe 打包 (2d) + 10 次 demo 验证 (1d) = **NJX 拍板 + 6 天** = **距离 100% 差 NJX 决策 + 6d**

### 偏离 3 · 文档陈旧（delivery.md 跟代码端真实状态不同步）

- **基线**: rules.md §1.1 "任何 4 文档改动 → 在 delivery.md 留 Changelog 记录" + 钉子 #38 5-min cross-doc audit
- **现状**: 7/12 22:00 审计 (AUDIT_REPORT.md) 发现 4 处 P0 文档偏离：
  1. **delivery.md T-6.11 row (line 185)** 写"⚠️ PARTIAL voice BLOCKED" → 实际 7/11 21:40 wave 9 10/10 = 100% 治本 (commit 01af3da + 6743bd2)
  2. **PHASE_6_FINAL.md** 缺 §7.8 Wave 9 段（line 359-377 只到 §7.7 wave 8d 9/10）
  3. **docs/PM_VERIFICATION_2026-07-11-20.md** 整篇不存在（有 `outputs/PM-VERIFICATION-2026-07-11-20/` 8 PNG + verify-report.md + commit f69e239, NJX 派单 4 件之 4 完全缺失）
  4. **RELEASE_NOTES.md §8.1 T-6.11 row** 缺 wave 9 100% 注释（写的是 90% PARTIAL 接受，缺 01af3da 引用）
- **根因**: Phase 6 收尾时 PM 漏跑 5-min cross-doc audit（钉子 #38 反例）— 7/12 22:00 audit 才发现
- **距离 MVP**: 1 个 subagent 跑 30min 全补 + 4 文档 v2 sync = **30 min - 1h**

### 偏离 4 · working tree 不干净（2 untracked）

- **基线**: rules.md §2.2 "git status --short 应为空（除本 subagent 自己的 untracked）"
- **现状**: 2 untracked = `plans/` (plan engine 临时目录遗留) + `screenshots/PM-VERIFICATION-2026-07-11-12/` (没 mv 到 docs)
- **根因**: 7/11 22:00 T-7.6 working tree 清理任务当时 commit 了 voice-test-report.json + mavis-trash stt_py_* + mv PM 验证截图，但 `plans/` 目录（plan engine plan 临时目录）遗留 + `screenshots/PM-VERIFICATION-2026-07-11-12/` 没 mv 到 docs
- **距离 MVP**: 5 min PM 自主清理

### 偏离 5 · Phase 7.5 W2/W3 派发 trigger 已到（NJX 9:30 拍板已 48min 但 W2 未派）

- **基线**: phase7_v3_mvp_h2_v3_plan.md §2 T-MVP-2-v3-W2 依赖 W1 done
- **现状**: W1 done @ 7/13 09:46 (commit 79bd720 + 8e84952) → 48min 前 W2 应该派发但 PM 还没派
- **根因**: PM 收到 7/13 9:35 立项后，10:00 后用户 10:10 给 "MVP 收官战" 任务 = **PM 派发延后 48min 是为了等用户新 prompt 一次性整合**
- **距离 MVP**: W2 派发 (1min PM cap) + 跑 2d + W3 1d = **3d**

---

## 3 · MVP 实际差距清单

| 维度 | 现状 | MVP 100% 差距 | 距离 | 阻塞 | 派发 |
|---|---|---|---|---|---|
| **N1 北极星** | macOS 10/10 ✅ + Win PARTIAL | 100% × 2 平台 | NJX 拍 Win VM SKU | 外部承诺/钱 | NJX 拍 + 6d sub-plan |
| **H1 文件导入** | 100% ✅ (T-7.1 wave 2.3 10/10 invocations) | 0 | 0 | - | - |
| **H2 AI 响应** | ⚠️ 7164ms / 20101ms 超阈 | 流式 P50 ≤ 1.2s | Phase 7.5 W2/W3 | - | subagent 3d |
| **H3 预览** | ✅ P90 4927ms ≤ 10s (T-6.11 wave 9 治本) | 0 | 0 | - | - |
| **H4 顾问带选项** | ✅ 95.65% ≥ 90% (T-1.2 verifier 真跑 22/23) | 0 | 0 | - | - |
| **H5 模板匹配** | ✅ 100% design-aware (T-7.2) | 0 | 0 | - | - |
| **H6 voice** | ✅ 10/10 = 100% (T-6.11 wave 9) | 0 | 0 | - | - |
| **H7 资源** | ✅ max 71MB ≤ 8G | 0 | 0 | - | - |
| **H8 PPTX 可编辑** | ✅ 真截图 WPS 6 slides (T-1.5) | 0 | 0 | - | - |
| **H9 PDF 无错乱** | ✅ Preview 11 pages (CJK Helvetica 方块已知次要 bug) | 0 | 0 | - | - |
| **G1 5 模块** | ✅ 5/5 merged | 0 | 0 | - | - |
| **G2 端到端** | ✅ T-2.2 8 PNG + 4 格式真活 (commit 6452840) | 0 | 0 | - | - |
| **G3 双平台** | macOS ✅ (T-3.1 + T-6.8 v0.2.0 装) + Win PARTIAL | Win 100% | NJX 拍 Win VM SKU | 外部承诺/钱 | NJX 拍 + 6d sub-plan |
| **G4 北极星 10 次** | macOS ✅ (T-4.1 commit 28aa5a4 10/10) + Win PARTIAL (Wine 模拟 docs-only) | Win 100% | NJX 拍 Win VM SKU | 外部承诺/钱 | NJX 拍 + 6d sub-plan |
| **文档 v0.3.0** | ⚠️ 4 文档陈旧（7/12 audit 4 项 P0 偏离） | 全 v0.3.0 sync | - | - | subagent 30min |
| **working tree** | 2 untracked (plans/ + screenshots/PM-VERIFICATION-2026-07-11-12/) | empty | - | - | PM 5min |
| **MVP 收口** | - | RELEASE_NOTES v0.3.0 + 钉子 #50 + cron 收摊 | - | - | subagent 30min |

**9 硬指标**: **8/9 ✅ + 1/9 ⚠️ (H2 待 W2/W3 治本)**
**4 Gate**: **G1 ✅ + G2 ✅ + G3 PARTIAL (macOS ✅ + Win 0%) + G4 PARTIAL (macOS ✅ + Win 0%)**
**北极星 N1**: **macOS 100% ✅ + Win 0% PARTIAL**
**文档 v0.3.0 收口**: **4 项 P0 偏离待补**
**working tree**: **2 untracked 待清理**

---

## 4 · 距离 MVP 100% 的实际路径（4 块拼图）

### 块 1 · H2 v3 治本（3d, **必做**）

- **W2 (2d)**: 流式 + 多 provider 集成
  - daemon `/v1/chat/stream` SSE 端点（与 W1 spec 对齐）
  - 6 provider 实现 (openai / claude / gemini / minimax / ollama / custom)
  - `provider_router.py` 升级：动态 provider 列表 + 流式路由
  - `provider_health.py` 健康监控（异步后台，TTL 30s）
  - 单元测试 ≥ 11 (test_streaming_*.py ≥ 6 + test_provider_*.py ≥ 5)
- **W3 (1d)**: 用户切 UI + H2 重新定义 + 9 硬指标回归
  - RN `provider_switch.tsx` + `provider_config.tsx` 设置页
  - `state/providers.ts` provider 列表 + 当前选中持久化
  - 4 文档同步: goal.md H2 重新定义 + plan.md 验收口径 + delivery.md 状态 + rules.md §9.1
  - `verify_h2_v3.mjs` 10 次真 app runtime 流式 P50 ≤ 1.2s
  - 9 硬指标 v3 回归全 PASS
  - 钉子 #50 append `mavis-runtime-discipline.md`
  - 5 张真 PNG 截图 (cu MCP 真点击 + 截图)

### 块 2 · Win half 100%（NJX 拍 + 6d, **NJX 决策后启动**）

- **Phase 1 (3d)**: react-native-windows-init + Win 11 VM setup + 路径兼容
- **Phase 2 (2d)**: 真 .exe 打包 (electron-builder Win target)
- **Phase 3 (1d)**: 10 次季度汇报 demo 真机验收
- **阻塞**: NJX 拍 Win VM SKU (4 选项: ¥65/¥95/¥305/月 + ¥99/年)

### 块 3 · 文档 v0.3.0 收口（30min - 1h, **必做**）

- delivery.md T-6.11 row 回填 wave 9 100% (commit 01af3da + 6743bd2)
- `docs/PM_VERIFICATION_2026-07-11-20.md` 整篇新建（基于 outputs/PM-VERIFICATION-2026-07-11-20/ 8 PNG + verify-report.md + commit f69e239）
- `RELEASE_NOTES.md` §8.1 T-6.11 row 补 wave 9 100% 注释
- `PHASE_6_FINAL.md` 补 §7.8 Wave 9 段
- 4 文档 grep cross-doc 一致 verify

### 块 4 · working tree 清理 + cron 收摊（5min, **必做**）

- `mavis-trash plans/` (plan engine 临时目录)
- `mv screenshots/PM-VERIFICATION-2026-07-11-12/ docs/PM_VERIFICATION_2026-07-11-12_screenshots/`
- `git status --short` = empty verify
- Phase 7.5 specific cron 收摊（使命终结）

**总工期**: 必做 **3.5d 主线** (H2 v3 W2/W3 + 文档 + 清理) + Win **6d** (NJX 拍板后) = **3.5d 主线 / 9.5d 含 Win**

**距离 MVP 100% 实际差距**: 3.5d 主线 (NJX 拍板可启动) + 6d Win (需 NJX 拍 VM SKU)

---

## 5 · MVP 任务清单（6 项 · 待 NJX 拍板）

| # | Task | 模块 | 基线项 | 验收口径 | 时间 | 派发 | 红线 | 阻塞 |
|---|---|---|---|---|---|---|---|---|
| **MVP-1** | H2 v3 W2 流式 + 多 provider 集成 | daemon + provider router | T-MVP-2-v3-W2 (Phase 7.5) | `curl -N http://localhost:PORT/v1/chat/stream provider=minimax` 真流式 (首 token < 1.5s) + 6 provider 单元测试全过 + provider config 改 reload (不需要重启) + 健康检查 5xx 自动 fallback 下一个 | 2d | subagent (coder, worktree `feat/mvp-h2-v3-w2`) | ❌ 不改 LRU cache v1 (commit e18a1cb) + 不破坏 advisor 3 轮并行 v2 (commit fe1e1f1) + 不 hardcode provider API key (走 .env) + 不改 RN 前端 (W3 改) | - |
| **MVP-2** | H2 v3 W3 用户切 UI + H2 重定 + 9 硬指标回归 | RN 前端 + 9 硬指标 | T-MVP-2-v3-W3 (Phase 7.5) | 用户切 6 provider UI 跑通 (设置页 → 选 provider → 保存 → 重启 app 后仍保留) + `verify_h2_v3.mjs` 跑 10 次真 app runtime 流式 demo, P50 ≤ 1.2s + P90 ≤ 3s (待 NJX 拍新阈值) + 9 硬指标 v3 回归全 PASS + 4 文档 v0.3.0 同步 + 钉子 #50 append `mavis-runtime-discipline.md` + 5 张真 PNG 截图存档 | 1d | subagent (coder, worktree `feat/mvp-h2-v3-w3`) | ❌ 不重打 DMG (T-6.8 v0.2.0 实际已装) + 不改 daemon 端 (W2 已改, W3 不动) + 不写流式逻辑 (W2 已写) + 不删 advisor 3 轮并行 + 不重命名 app | - |
| **MVP-3** | 4 文档陈旧补段 (T-6.11 row + PM_VERIFICATION-11-20 + RELEASE_NOTES §8.1 + PHASE_6_FINAL §7.8) | docs | 7/12 audit 4 项 P0 偏离 | grep delivery.md line 185 T-6.11 row 含 "wave 9 10/10 = 100% 治本" + `docs/PM_VERIFICATION_2026-07-11-20.md` 整篇落地 (8 PNG + verify-report.md + commit f69e239 引用) + RELEASE_NOTES §8.1 T-6.11 row 含 wave 9 100% 注释 + PHASE_6_FINAL §7.8 段 + 4 文档 grep cross-doc 一致 | 30min - 1h | subagent (general, worktree `docs-sync-v3`) | ❌ 不改 4 文档基线内容 (changelog 之外) + 不改 PRD H2 旧值 (W3 改) | - |
| **MVP-4** | working tree 清理 + cron 收摊 + RELEASE_NOTES v0.3.0 + 钉子 #50 | git + cron + docs | Phase 7.5 收口 | `mavis-trash plans/` + `mv screenshots/PM-VERIFICATION-2026-07-11-12/ docs/PM_VERIFICATION_2026-07-11-12_screenshots/` + `git status --short` = empty verify + Phase 7.5 specific cron 收摊 + RELEASE_NOTES v0.3.0 11 节 + 钉子 #50 append mavis-runtime-discipline.md (provider 切换最佳实践 + 流式架构经验) | 30min | **PM 自主** | ❌ 不 rm -rf (mavis-trash 单件) + 不删 main commit + 不删基线 4 文档 | - |
| **MVP-5 (待 NJX 拍板)** | Win half 100% 启动 | Win sub-plan | T-3.2 + T-G4-win (Phase 3 + 4) | NJX 拍 Win VM SKU (¥65/¥95/¥305/月 + ¥99/年 4 选 1) → react-native-windows-init (3d) + Win 11 VM 真 .exe 打包 (2d) + 10 次季度汇报 demo (1d) + docs/platform-windows.md 更新 + cross-doc audit | NJX 拍 + 6d | subagent (coder, worktree `feat/win-half-100pct`) | ❌ 不删 macOS app + 不改 daemon 跨平台代码 (除非必需) + NJX 拍板前不启动 | **NJX 拍 Win VM SKU** |
| **MVP-6 (可选 · 推后 W12 Gate)** | Phase 8 Beta 化启动 | docs | goal.md §6 Phase 8 (12 周路线图) | 1-2 个航材场景模板 + Beta 文档 + 部署脚本 | 推后 (W12 Gate per OPC 飞轮) | NJX 拍 | ❌ 不动 MVP 1-5 任务 | **NJX 拍** |

---

## 6 · PM 视角一针见血（3 句话）

1. **MVP 实际差距 = 3.5d 主线（必做）+ 6d Win（NJX 拍板）**，不卡死时间（NJX 9/30 拍"质量优先"按质量门卡推进）
2. **不是技术问题，是 2 个 NJX 决策卡住**：(a) **H2 阈值新值**（W3 真测后拍）+ (b) **Win VM SKU**（NJX 12:27 选腾讯云 + 已登陆 + SKU 未拍）
3. **macOS 半边距 MVP 100% 差 5%** = 3.5d 必做（流式+UI+文档+清理），剩下 Win half 是钱/资源决策（¥65-305/月 或 ¥99/年）

**NJX 拍板优先**（弹窗推荐 🅰）：
1. **MVP-1+2+3+4 全批** (主线 3.5d 必做) → PM 立即派 4 个 subagent + 1 PM 自主 MVP-4
2. **MVP-5 Win half 拍板** (¥65/¥95/¥305/月 + ¥99/年 选 1) → 启动 Win sub-plan
3. **H2 阈值新值** (P50 ≤ 1.2s 推荐) → W3 收口拍

---

## 7 · VERDICT

- **基线覆盖率**:
  - macOS half: 9.5/10 = 95% (8/9 硬指标 ✅ + 1/9 ⚠️ H2 + G1 ✅ + G2 ✅ + G3 macOS ✅ + G4 macOS ✅)
  - Win half: 0/10 = 0% (4 PNG mock + docs-only)
  - **整体 MVP = 47.5%** (macOS 95% × 50% 平台 + Win 0% × 50% 平台)

- **MVP 任务清单**: 6 项 (4 必做 MVP-1+2+3+4 + 1 待拍 MVP-5 Win half + 1 可选推后 MVP-6 Beta 化)

- **主线 3.5d 必做** + **Win 6d (NJX 拍板后)** = MVP 100% macOS 9:30-7/16 13:00 (按 phase7_v3_mvp_h2_v3_plan.md §6 时间线) + Win 7/13-7/20 (NJX 拍 SKU 后启动)

- **关键阻塞**:
  1. **NJX 拍 MVP-5 Win VM SKU** (¥65/¥95/¥305/月 + ¥99/年 4 选 1) → Phase 4 Win half 启动 trigger
  2. **NJX 拍 H2 阈值新值** (PM 推荐 P50 ≤ 1.2s, 跟 Anthropic/OpenAI 流式 P50 600-1200ms 行业一致) → W3 收口

- **PM 自查**:
  - ✅ 30s 三件套跑了
  - ✅ 读基线 4 文档 + phase6_plan + phase7.5 plan + 7/12 audit + 7/11 T-7.0 + 7/13 W1
  - ✅ 5 偏离点 + 5 块拼图 + 6 任务清单 一针见血
  - ✅ 1 次性给 NJX 拍板 (4 选项 + 推荐)
  - ❌ 派 subagent 没走通 (mavis CLI 沙箱拦截 SIGKILL 137) → 改走 PM 自主出 doc (已通知)
  - ❌ 派 W2 没启动 (等 NJX 拍 MVP-1+2 后)
  - ❌ docs v0.3.0 没补 (等 NJX 拍 MVP-3 后)
  - ❌ working tree 没清 (等 NJX 拍 MVP-4 后)
