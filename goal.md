# 灵犀演示 — 目标文档（goal.md）

> 回答 4 个问题：**为什么做 / 为谁做 / 做什么 / 怎么算成功**。
> 经 PM 与 owner（NJX）于 2026-07-09 头脑风暴拍板。

---

## 1. 一句话目标

做一个 AI 驱动的办公内容生成桌面 App（灵犀演示），主打 **"AI 顾问引导 + HTML 预览可控 + 多格式输出"** 的一站式 PPT/报告生产体验，从"找素材/理逻辑/调格式"三大痛点切入，把单次 PPT/报告制作从数小时压到分钟级。

---

## 2. 用户与场景

| 字段 | 内容 |
|---|---|
| **Owner**（拍板人） | NJX（OPC 一人公司 + AI Agent 团队） |
| **终端用户** | 职场人士（季度/年度汇报、周报月报、立项材料）；学生（答辩 PPT、课程汇报）；运营/市场（活动宣讲、复盘报告） |
| **First-use 场景** | **季度汇报 PPT**（职场最高频 + 4 种输出格式全打） |
| **使用频次** | 中高频（个人每周 1-3 次） |
| **核心触发** | 用户准备对外汇报材料、需要把零散资料快速结构化为可演示文档 |

---

## 3. 核心需求（P0 全做，PRD 5 大模块）

| # | 优先级 | 模块 | 关键能力 |
|---|---|---|---|
| 3.1 | P0 | 文件管理与知识库构建 | 本地单文件/文件夹导入，Word/PDF/Excel/PPTX/MD/JPG/PNG 全格式；LLM Wiki 自动整理（严格不用 RAG）；仅本地存储 |
| 3.2 | P0 | 顾问式需求交互 | AI 主动选项提问（90% 提问带选项），选项点击 + 语音 + 文字三模输入；实时关联知识库补全 |
| 3.3 | P0 | 模板导入与适配 | 用户导入 `.pptx` 模板 → 转 HTML → AI 分析版式/配色/字体；无模板则用内置简约商务（浅/深双主题） |
| 3.4 | P0 | HTML 预览与编辑 | AI 优先出 HTML 预览（不直接成品），轻量改文字/段落直接在预览页改，复杂改动回 AI 重新生成；实时保存 |
| 3.5 | P0 | 多格式输出 | 确认预览后选格式：PPT 类出 `.pptx + .pdf`；报告类出 `.docx/.html/.pdf/.pptx` 四选 |

**性能门卡（验收硬指标）**：
- 100M 以内文件导入成功率 ≥ 99%
- AI 交互响应延迟 ≤ 3s
- HTML 预览生成延迟 ≤ 10s
- 全流程资源占用 ≤ 8G 内存

---

## 4. 范围边界（明确不做 — MVP 砍掉）

> 防止范围蔓延。MVP 砍掉所有 P1+，聚焦 P0 5 大模块端到端跑通。

- ❌ **不做** 多人协作/团队空间（单机单用户）
- ❌ **不做** 云端知识库/账号体系（仅本地存储，PRD 已要求）
- ❌ **不做** 移动端 App（MVP 桌面端优先，跨 macOS + Win）
- ❌ **不做** 模板市场/社区分享（用户自带模板即可）
- ❌ **不做** 实时协作编辑（单机单用户）
- ❌ **不做** 自定义 AI 模型训练（仅消费现有 MiniMax 能力）
- ❌ **不做** 自动 PPT 动画/转场生成（仅内容生成，动画由 PPT 模板自带）
- ❌ **不做** 国际化 i18n（首版中文优先）

---

## 5. 成功标准（北极星指标）

> **北极星 1 个：完成 1 次"季度汇报 PPT 端到端 demo"的成功率 = 100%**
> 衡量：把 5-10 个零散文件导入 → AI 顾问引导 → HTML 预览 → 选 4 种输出格式全部成功生成 → 5 模块全跑通，重复 10 次零失败。

**辅助指标**（PRD 9 硬指标 · 对齐 phase6_plan T-6.3 line 130-139）：
- HTML 预览生成延迟 ≤ 10s（PRD 硬指标）
- AI 交互响应延迟（**v3 流式升级，NJX 2026-07-13 11:12 拍板**）= **流式首 token P50 ≤ 1.5s + P90 ≤ 3.5s**（旧：full response avg ≤ 3s / max ≤ 5s，流式后改为首 token 计时，业内 Anthropic/OpenAI 流式 P50 600-1200ms，NJX 选"宽松"档）
- 文件导入成功率 ≥ 99%（PRD 硬指标）
- 顾问式交互 ≥ 90% 提问带可选项（PRD 硬指标）
- 模板导入后生成内容 100% 匹配模板版式/配色/字体（PRD 硬指标）
- voice 输入识别准确率 ≥ 95%（PRD 硬指标）
- 资源占用 max ≤ 8G 内存（PRD 硬指标）
- PPTX 可编辑（Office/WPS 真截图，10 次）
- PDF 无格式错乱（图片/字体/版式正常，10 次）

**当前状态 (2026-07-13 baseline_truth)** — 9 硬指标实跑结果（来源 `work/tasks/2026-07-13-lingxi-baseline-acceptance/ACCEPTANCE_REPORT.md` §3 + §4.1-§4.5 现场证据 + `commands.log` 隔离 probe）：
- H1 文件导入 ≥ 99%: ⚠️ **UNVERIFIED-BY-2026-07-13-ACCEPTANCE**. T-7.1 报 10/10 PASS, 但 ACCEPTANCE 现场发现 T-6.3 文档链仍依赖 mock + fallback 包装, **本轮验收不认可, 需 Wave 1 重测**
- H2 v3 流式首 token P50 ≤ 1.5s / P90 ≤ 3.5s: ❌ **未达 / NOT MEASURED**. 当前实测 0.001-0.005ms 来自 `hello (mock)`, 无性能意义. 隔离 probe (`backend/daemon/providers/api_provider.py:15,156,288-291`) 验证 daemon 无 key 时静默返回 mock, T-MVP-2-v3 W2/W3 仍 pending. **阈值锁定不变 (P50 ≤ 1.5s + P90 ≤ 3.5s, NJX 11:12 拍板)**
- H3 HTML 预览 ≤ 10s: ⚠️ **UNVERIFIED-BY-2026-07-13-ACCEPTANCE**. wave 9 报 P90=4.9s, 但本轮未独立 verify (T-7.4 补 v2, 但 v2 本身基于未独立 verify 数据)
- H4 顾问 ≥ 90% 选项: ⚠️ **UNVERIFIED-BY-2026-07-13-ACCEPTANCE**. T-1.2 报 22/23 = 95.65%, 本轮未独立 verify
- H5 模板 100%: ❌ **未达严格 100%**. 严格 aggregate = 77% (palette 4/5 + fonts 1/2, `delivery.md:216-217`), NJX 2026-07-11 22:55 拍 design-aware = 100% (放宽口径), **本轮验收不认可放宽**
- H6 voice ≥ 95%: ❌ **未达 / INVALID**. T-6.11 wave 9 报 10/10 = 100%, 但 T-6.3 文档链 (`real-runtime-validate.ts:753-770`) 证明 real-app validator 直接赋值 0.96 + pool size 0, **不是测量结果**. wave 8c 70% + wave 8d 90% + 钉子 #44 voice-gate 5-line patch 仍未达 95%
- H7 内存 ≤ 8G: ✅ T-6.3 报 71MB, 本轮 verify OK
- H8 PPTX 可编辑 (10 次): ⚠️ **UNVERIFIED-BY-2026-07-13-ACCEPTANCE**. T-6.3 报 10/10, 但 ACCEPTANCE §5 指出"WPS 进程能打开 PPTX" 不能算 "PPTX 可编辑" 证据, **本轮未通过编辑验收**
- H9 PDF 无乱码 (10 次): ❌ **未达**. 本轮 PDF 现场乱码 + 大面积空白 (`ACCEPTANCE_REPORT.md` §4.3 + `screenshots/08-09`), 独立 Poppler 渲染 (`pdftoppm`) 确认首页 CJK 标题乱码 + 后续空白 + 第 2 页仍可见 `hello (mock)`. `delivery.md:493-506` 自承 CJK 字体为已知问题, 仍勾选 .pdf 无格式错乱 — **与本硬指标直接冲突**

**9/9 状态汇总**: ✅ × 1 (H7) + ⚠️ × 4 (H1/H3/H4/H8) + ❌ × 4 (H2/H5/H6/H9). **北极星未达 = Gate 4 FAIL**. **4 Gate (Gate 1/2/3/4) 全部 FAIL**, 详见 `work/tasks/2026-07-13-lingxi-baseline-acceptance/ACCEPTANCE_REPORT.md` §3.

**质量门卡**（不是按时间，是按质量）：
- **Gate 1**：5 大模块各自单模块 demo 跑通（独立验收）
- **Gate 2**：5 模块串成端到端 demo（季度汇报场景一次走通）
- **Gate 3**：macOS + Win 双平台端到端各跑 1 次（双 sub-agent 并行验收）
- **Gate 4**：连续 10 次季度汇报 demo 零失败（北极星验证）
- **任一 Gate 不过 = 不进下一阶段**（NJX 拍板"质量优先"的硬底线）

**Gate 实际状态 (2026-07-13 baseline_truth)**:
- **Gate 1 ❌ FAIL**: 五模块独立 demo 仅 jest 单测层 PASS, 实际 `PlaceholderScreen` 渲染 (`renderer.jsx:13-17,35-88,181-184`), 用户无法触发真实业务. ACCEPTANCE §4.1 直接否决
- **Gate 2 ❌ FAIL**: UI 无导入/顾问问答/模板选择/编辑/导出能力, CLI 是旁路流程, 不算产品端到端. ACCEPTANCE §4.2 证明 `full-demo.ts:152-169,256-259,333-345,359-363` 把 mock/partial 包装成 `ok: true` + 退出 0
- **Gate 3 ❌ FAIL**: macOS v0.2.0 仅占位壳可启动, Windows 真 `.exe` E2E 缺失 (`delivery.md` T-3.2 override_accept PARTIAL). ACCEPTANCE §5 实测
- **Gate 4 ❌ FAIL / INVALID**: 10 次 demo validator 启 App 后另跑 CLI + 未切路由 (`real-runtime-validate.ts:745-751`) + 硬编码 voice=0.96 (`real-runtime-validate.ts:753-770`), 证据无效. 4 格式 size 10 次 stddev = 0 = mock 假 data (钉子 #42/#45)
- **0/4 Gate 通过** (来源: `ACCEPTANCE_REPORT.md` §3 表). **任何 Gate 失败 = 不进下一阶段** — 当前 Phase 4/5 叙述不成立, 详见 `delivery.md` 2026-07-13 16:30 changelog 段 + §3.6 标 superseded 段

---

## 6. 时间线

> **无固定截止时间，按"质量门卡"推进**（NJX 2026-07-09 拍板"质量优先，时间不是问题"）。

| 阶段 | 内容 | 出口标准 |
|---|---|---|
| **Phase 0** | 立项（4 文档 ready + owner 签字） | 4 文档全员 ready + 最终签字弹窗通过 |
| **Phase 1** | 5 模块独立 demo（Gate 1） | 5 模块各自 demo 跑通，单模块验收通过 |
| **Phase 2** | 端到端 demo（Gate 2） | 季度汇报场景 1 次端到端走通，截图存档 |
| **Phase 3** | 双平台并行（Gate 3） | macOS + Win 各跑 1 次端到端成功，截图存档 |
| **Phase 4** | 北极星验证（Gate 4） | 连续 10 次季度汇报 demo 零失败 |

**并行策略**：
- Phase 1 阶段 5 模块**全并行**（不同 sub-agent + 不同 worktree + 无共享状态）
- Phase 2 阶段按 plan.md 依赖图串行 + 并行混合
- Phase 3 阶段 macOS / Win 各起一个 sub-agent 并行
- Phase 4 阶段串行跑 10 次 demo，由 PM 验收

---

## 7. 假设与约束

**假设**（默认成立）：
- 假设 owner 每天会检查 delivery.md 进度
- 假设运行环境 macOS 14+ / Windows 11
- 假设 owner 已购买 MiniMax Token Plan，可直接复用计费
- 假设 7x24 AI agent 算力可用，OPC 单人不需要随时在线
- 假设 MiniMax Code CLI 在 macOS + Win 双平台均可用

**约束**：
- 单人 OPC + AI Agent 团队协作模式
- 严格使用 LLM Wiki 方案（不用 RAG，PRD 硬约束）
- AI 能力接入统一通过 **HTTP daemon + AIProvider 抽象层**（NJX 2026-07-09 拍板）
  - 初期双路：**CLI 主调用 + API 兜底**（NJX 2026-07-09 拍板 "初期就双路，复杂度 AI 团队扛"）
  - 后期可无痛切换/扩展 provider
- 全本地存储，不上传云端
- 双平台：macOS + Windows 必须同时支持（NJX 2026-07-09 拍板 "并行"）

---

## 8. 风险登记

| # | 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|---|
| R-1 | MiniMax Code CLI 在 Windows 上路径/编码问题 | 中 | 高 | Phase 3 优先跑 Win 端到端，提前暴露；用 HTTP daemon 隔离 CLI 进程 |
| R-2 | CLI + API 双路调用的一致性（同一 prompt 两路结果差异） | 中 | 中 | AIProvider 抽象层统一 schema；CLI 失败才回退 API，不混用 |
| R-3 | LLM Wiki 在大文件（>50M）下处理慢或失败 | 中 | 高 | Phase 1 文件管理模块先压测 100M；分块 + 进度条 |
| R-4 | React Native 桌面端（macOS/Win）生态不成熟，组件库选型踩坑 | 中 | 中 | 优先用 RN + electron-shell 或 react-native-macos；Phase 1 先用最小可交互 demo 验证 RN 桌面端可行 |
| R-5 | PPTX 模板 → HTML 转换保真度不足（版式/字体丢失） | 中 | 高 | Phase 1 模板模块用 libreoffice + 自研解析双路；先做"白底+文字+图片"基础版式 |
| R-6 | 5 模块并行开发的接口契约漂移 | 高 | 中 | plan.md 必须先定 **跨模块 API schema**（文件导入结果、预览 JSON 格式、输出格式参数），所有 sub-agent 用同一份契约 |
| R-7 | 双平台并行资源开销大（2 套 sub-agent + 2 套 worktree） | 低 | 中 | 每个 sub-agent 自带 smoke test，PM 合并前跑跨平台 smoke |
| R-8 | voice 输入在 Windows 上识别率 < 95% | 中 | 低 | PRD 硬指标，先 macOS 跑通 voice，Win 端用 Whisper 本地替代 |

---

## 完成度自检

- [x] owner 看完 30 秒能复述出"我们做什么"
- [x] 范围边界已写清（8 条不做）
- [x] 有 1 个可量化的北极星指标
- [x] 时间线有 4 个质量 Gate（不是按周卡死）
- [x] 识别 8 个风险并有缓解
- [x] First-use 场景明确：季度汇报 PPT
- [x] 平台范围明确：macOS + Win 并行
- [x] CLI 接入方式明确：HTTP daemon + AIProvider 抽象 + CLI 主 API 兜底

**✅ 8 项全过 → 进入 plan.md 起草**

---

## Changelog

### 2026-07-13 16:30 — baseline_truth 复位（4 文档 = 现场证据）

- Author: PM (Mavis) + baseline_truth_agent (general subagent)
- 触发: `work/tasks/2026-07-13-lingxi-baseline-acceptance/ACCEPTANCE_REPORT.md` FAIL 结论 (NJX 拍板, 2026-07-13 15:30) + 派发 `wave_0_baseline_truth` 任务合同
- 范围: **4 文档 (goal/plan/rules/delivery) + RELEASE_NOTES.md** — 同步对齐 9 硬指标当前真值 + 4 Gate 实际状态 (0/4 PASS) + Wave 1-5 任务清单
- **不改阈值数字**: H2 阈值 P50 ≤ 1.5s + P90 ≤ 3.5s 锁定值保留 (NJX 11:12 拍板不可改)
- **不改历史签字**: 不修改 ACCEPTANCE_REPORT.md 的 FAIL 结论 (NJX 拍板结果), 不动历史 T-7.x 状态, 不删任何 worktree
- **新增状态段**:
  - `goal.md §5` 加"当前状态 (2026-07-13 baseline_truth)" 子段: 9 硬指标实跑结果 ✅×1 / ⚠️×4 / ❌×4
  - `goal.md §5 Gate 实际状态`: Gate 1/2/3/4 全部 FAIL 标出
  - `plan.md §1` 加"当前阶段 (2026-07-13)" 段: Phase 7.5 W1 done + W2/W3 pending + Wave 0 启动
  - `rules.md §9` 加钉子 #46 (PM HARD GATE for false-green) + 钉子 #47 (RN Pressable vs Web placeholder)
  - `delivery.md §1 changelog` 2026-07-13 16:30 段: MVP Recovery 立项 + Wave 0 baseline_truth_agent 派发
  - `delivery.md §2` T-7.0/T-7.1/T-7.2/T-7.3/T-7.4/T-7.5 状态对齐 ACCEPTANCE 验收 (不沿用历史 ✅ done 标签, 标 ⚠️ UNVERIFIED-BY-2026-07-13-ACCEPTANCE)
  - `delivery.md §2` 末尾加新表 T-W0..T-W5 MVP Recovery 任务清单
  - `delivery.md §2` 加 4 Gate 状态行: Gate 1-4 = FAIL
  - `delivery.md §2` 旧"Phase 4/5 done" / "v0.2.0 release" 叙述加 (superseded by 2026-07-13 ACCEPTANCE_REPORT FAIL) 标记
  - `RELEASE_NOTES.md` 同步加 ⚠️ 段
- **新产出**: `work/tasks/2026-07-13-mvp-recovery/cross-doc-audit.md` (4 文档互查表, 标出仍存在的冲突 + 修了哪些)
- **不 commit**: PM 收口时统一 1 commit (4 文档 + 1 新 cross-doc-audit.md + 1 RELEASE_NOTES 段), 本 Wave 0 subagent 不 push
- 下一步: PM 收口 (cross-doc audit 5 件套 + commit) → 派 Wave 1 (ui_golden_path_agent, coder) + 配独立 reviewer

### 2026-07-13 11:12 — H2 v3 阈值锁定 + Win VM = 🅱 GitHub Actions Win runner
- Author: PM (Mavis)
- Confirmed by: NJX 2026-07-13 11:12 拍板 (弹窗 reply 2 项)
- 拍板内容:
  - **H2 阈值锁定**: 流式首 token **P50 ≤ 1.5s + P90 ≤ 3.5s**（NJX 选"宽松"档，对比候选 P50 ≤ 1.2s / P90 ≤ 3s；流式架构下首 token 才是用户感知延迟，full response 计时无意义）
  - **Win VM 方案**: 🅱 **GitHub Actions Win runner**（从 docs/platform-windows-vm-options.md 4 选 1 锁定，解 T-3.2 PARTIAL pending；用现有 `.github/workflows/win-test.yml` 跑 `windows-latest` runner 出 `.exe` + 跑 e2e）
- 基线影响:
  - `goal.md §5 辅助指标`: H2 指标改写（"AI 交互响应延迟 ≤ 3s avg / ≤ 5s max" → "流式首 token P50 ≤ 1.5s + P90 ≤ 3.5s"）
  - `plan.md §2 T-1.2 验收`: H2 指标同步
  - `plan.md §2 T-3.2`: 分配给 sub-agent-windows 段加 Win VM = 🅱 GitHub Actions Win runner 标注
  - `plan.md §2 T-4.1 验收`: H2 指标同步
  - `plan.md §5 风险表`: Win VM 风险行加 "已拍 🅱 GitHub Actions Win runner (2026-07-13 11:12)"
  - `phase7_v3_mvp_h2_v3_plan.md §5`: H2 阈值候选变锁定值
- PM 自主派发: 3 文档同步编辑 + 准备 W1 subagent 补 prompt（H2 候选值变锁定值）+ 不重启 Phase 3/4 Win half（sprint 仍是 Phase 7.5）
- 教训:
  - 钉子 #5 PRD 级 >30min 拆 ≤3 wave：H2 阈值属于 Phase 7.5 Gate 6 必拍项，PM 自主落基线不弹 NJX
  - 钉子 #39 NJX 临时拍板让 PM 反思基线：H2 阈值 / Win VM 拍板都从 30s grep goal.md 验证范围，**无冲突**（H2 = Phase 7.5 Gate 6 必拍，Win VM = 解 T-3.2 PARTIAL pending），PM 自主落基线
  - 钉子 #25 path precision: 拍板值精确到具体 P50/P90 数字 + 标注"宽松"档，避免基线歧义
- 北极星对齐: 仍为"季度汇报 PPT 端到端 demo 100% 成功率"（H2 阈值升级 = 手段，不是目的）
- 下一步: 弹窗 1 步问 NJX Win half 重启时机（不立即派 Win half / 立即派 / 暂缓到 7/16 Phase 7.5 收口后）

### 2026-07-13 09:35 — Phase 7.5 基线扩展（T-MVP-2 v3 · H2 架构升级）
- Author: PM (Mavis)
- Confirmed by: NJX 2026-07-13 09:30 拍板 🅰 T-MVP-2 v3 全部（流式 + 多 provider + 用户切 UI + H2 重新定义，3-4 天）+ ✅ 纳入基线
- 触发链: H2 真 LLM 延迟 avg=7259ms / max=9297ms（超 PRD 2.4x/1.9x）→ 4 选 1 弹窗 → NJX 9:30 选 🅰 纳入基线
- 基线扩展内容:
  - **H2 指标语义升级**: 旧 = "AI 交互响应延迟 ≤ 3s avg / ≤ 5s max" (full response 计时) → 新候选 = "AI 响应流式首 token 延迟 P50 ≤ 1.2s" (流式架构下首 token 才是用户感知延迟, full response 计时无意义)
  - **架构升级**: 引入流式响应 (SSE/WebSocket) + 多 provider 路由 (6 provider 动态切换) + 用户切模型 UI (设置页 provider 列表)
  - **provider 列表**: OpenAI / Claude / Gemini / MiniMax / Ollama (本地) / 自定义 OpenAI 兼容
  - **3 wave 拆解**: W1 调研+设计 (1-2h) / W2 流式+多 provider (2d) / W3 UI+阈值+验证 (1d)
  - **4 文档同步**: goal.md H2 重定义 + plan.md 验收口径 + delivery.md 状态 + rules.md 约束 (W3 收口)
  - **钉子 #50 准备**: W3 收口时 append mavis-runtime-discipline.md (provider 切换 + 流式架构最佳实践)
- 关键决策记录:
  - 弹窗 "H2 真 LLM 延迟 avg=7259ms / max=9297ms（超阈 2.4x/1.9x），v0.2.0 怎么走？" → NJX Others: "以minimax api调用的官方数据评估如何优化，还要考虑后续用户自行切换模型也要api可用，这个AI 交互响应延迟需要合理且智能，搜索有没有成熟方案"
  - 弹窗 "H2 阈值 + 架构一起升级（流式 + 多 provider + 用户切模型），纳入基线吗？" → NJX 选 🅰 T-MVP-2 v3 全部（推荐 - 流式 + 多 provider + 用户切 UI + H2 重新定义，3-4 天）
- 教训 (PM discipline):
  - 钉子 #5 PRD 级 >30min 拆 ≤3 wave × ≤30min cap
  - 钉子 #38 5-min cross-doc audit 必跑 (主分支 / delivery / plan / goal 4 件套)
  - §0.6.6 PM 自主派发基线对应项 (不弹 NJX 路由器)
  - §0.1 业主沉默 = 授权 (NJX 拍板后 PM 立刻派, 不再问"接下来做什么")
- 北极星对齐: 仍为"季度汇报 PPT 端到端 demo 100% 成功率" (H2 重定义是手段, 不是目的)
- 4 个质量 Gate: 仍为 G1/G2/G3/G4 (新增 Gate 6 = H2 架构升级 W1/W2/W3 全 done)
- 8 风险保留 + 新增 6 风险 (R-7.5-1~6) 见 phase7_v3_mvp_h2_v3_plan.md §4
- 下一步: W1 subagent 派发 (worktree `feat/mvp-h2-v3`, 30min PM cap)

### 2026-07-11 23:00
- Author: PM (Mavis)
- Action: Phase 7 Wave 2 收口 — T-7.1 H1 10/10 full pass (merge 288a5d1) + T-7.2 H5 3/3 模板 design-aware 100% (merge e01ed05)
- Reason: Phase 7 Plan 2 (PRD 9 硬指标补段) Wave 2 全部 PASS — H1 (file_import ≥99%) + H5 (template 100% match design-aware) 两个 P0 硬指标达成
- Confirmed by: NJX 22:55 拍板 T-7.2 = 🅰 design-aware + merge (T-7.1 无需拍, 严格指标 100%)
- 关键决策记录:
  - T-7.1 H1 严格 100% (10/10 invocations exit 0 + 70/70 格式 + 100/100 stress) — verifier PASS, 无 fallback
  - T-7.2 H5 design-aware 100% (3/3 模板 layout/palette/fonts) + 严格视角 77% aggregate (documented fallback text=#1A1A1A + body=heading) — verifier PASS, NJX 拍 design-aware 视角
  - 钉子 #38 cross-doc audit 全 5/5 verify (worktree / git log / server port / mtime / 5 件套)
  - 4 文档同步: delivery.md (T-7.1/T-7.2 行 → done + merge SHA) / goal.md (本 changelog) / board.md (append done 行) / plan.yaml (T-7.1/T-7.2 状态 done)
  - cron t72-verifier-watch disabled (使命终结)
  - Phase 6 v0.2.0 实际状态签字 = NJX 22:55 临时拍板 "PM 决定" v0.2.1 → PM 5-min cross-doc audit (钉子 #38) ground truth 拒绝 v0.2.1: `defaults read /Applications/灵犀演示.app CFBundleShortVersionString = 0.2.0`, dist/ DMG 目录不存在 (dist/mac/灵犀演示.app 实际 0.1.0 dev build, 非 v0.2.0 release 产物), 无 v0.2.1 实物 → 按钉子 #9/#22/#23 拒绝 producer 幻觉 → PM 自主签 **v0.2.0 实际状态** (含 Phase 6 收口 + T-7.1 H1 + T-7.2 H5 一起进 release notes), NJX 23:11 popup 答 "PM基于项目基线决策" 接受纠错; v0.2.1 重打未实施, 已知限制 (钉子 #38 纠错已同步: docs/RELEASE_NOTES.md line 262 §8 v0.2.0 段 + delivery.md line 184 T-6.8 row)

### 2026-07-09 08:24
- Author: PM (Mavis)
- Action: 新建 goal.md
- Reason: 灵犀演示项目立项（基于 PRD V1.0 + NJX 5 项决策拍板）
- Confirmed by: NJX（5 个头脑风暴弹窗全部确认）
- 关键决策记录：
  - 弹窗 1/5: MVP 范围 = **完整 P0（5 大模块全跑通）**
  - 弹窗 2/5: 截止 = **质量优先，按质量门卡分阶段**（非时间驱动）
  - 弹窗 3/5: 平台 = **macOS + Win 并行**（双 sub-agent）
  - 弹窗 4/5: CLI 接入 = **HTTP daemon + AIProvider 抽象 + CLI 主 + API 兜底**（初期双路）
  - 弹窗 5/5: First-use 场景 = **季度汇报 PPT**
