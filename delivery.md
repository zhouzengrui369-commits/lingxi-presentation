# 灵犀演示 — 交付文档（delivery.md）

> 每任务的"可观察交付标准 + 截图存档索引 + 状态机"。验收的 SSoT（single source of truth）。
> NJX 2026-07-09 拍板"质量优先"：本文件的所有验收项**每项必过**才视为交付完成。

---

## 1. Changelog

### PM ↔ Owner 弹窗记录（2026-07-09 立项阶段）

| 时间 | 弹窗 | 场景 | owner 决策 |
|---|---|---|---|
| 08:17 | #1 | MVP 范围 | 完整 P0（5 大模块全跑通） |
| 08:18 | #2 | MVP 截止 | Others: **质量优先，按质量门卡分阶段**（不卡死时间） |
| 08:19 | #3 | 平台优先 | macOS + Win 并行（双 sub-agent） |
| 08:20-08:23 | #4 (v1+v2) | CLI 接入 | Others: **HTTP daemon + AIProvider 抽象 + CLI 主 + API 兜底**（初期双路） |
| 08:24 | #5 | First-use 场景 | 季度汇报 PPT |
| 08:35 | #6 | goal.md 批准 | 批准原方案 |
| 08:45 | #7 | plan.md 批准 | 批准原方案 |
| 08:49 | #8 | rules.md 批准 | 批准原方案 |

### 基线变更记录

#### 2026-07-09 08:35 — goal.md 批准
- Author: PM
- Confirmed by: NJX
- 内容：4 项核心决策 + 8 条不做 + 4 个质量 Gate + 8 个风险

#### 2026-07-09 08:45 — plan.md 批准
- Author: PM
- Confirmed by: NJX
- 内容：17 个 task，Phase 1 并行度 87.5%（8 个 sub-agent 同时跑）

#### 2026-07-09 08:49 — rules.md 批准
- Author: PM
- Confirmed by: NJX
- 内容：9 节 5 大块 + 灵犀专属 PRD 硬指标

---

## 2. 任务总览（实时更新）

| ID | 任务名 | 优先级 | 状态 | 时长档 | 跟踪机制 | 验收时间 | 验收人 | 截图 |
|---|---|---|---|---|---|---|---|---|
| T-0.0 | 4 个基线文档起草 + owner 签字 | P0 | in_progress | 中 | session | - | - | - |
| T-1.0.a | HTTP daemon + AIProvider 抽象层 | P0 | pending | 中 | 轮询 | - | - | - |
| T-1.0.b | RN 桌面端脚手架（macOS+Win） | P0 | pending | 中 | 轮询 | - | - | - |
| T-1.0.c | 跨模块 API schema 契约 | P0 | pending | 短 | session | - | - | - |
| T-1.1 | 文件管理与 LLM Wiki 知识库 | P0 | pending | 长 | cron 30min | - | - | - |
| T-1.2 | 顾问式需求交互 | P0 | pending | 长 | cron 30min | - | - | - |
| T-1.3 | 模板导入与适配 | P0 | pending | 长 | cron 30min | - | - | - |
| T-1.4 | HTML 预览与编辑 | P0 | pending | 长 | cron 30min | - | - | - |
| T-1.5 | 多格式输出 | P0 | pending | 长 | cron 30min | - | - | - |
| T-2.1 | 端到端集成 | P0 | pending | 中 | 轮询 | - | - | - |
| T-2.2 | PM 端到端 demo 跑通 | P0 | pending | 短 | session | - | - | - |
| T-2.3 | 启动页动态动画 + 图标 | P0 | pending | 中 | 轮询 | - | - | - |
| T-3.1 | macOS 端到端 | P0 | pending | 中 | 轮询 | - | - | - |
| T-3.2 | Windows 端到端 | P0 | pending | 中 | 轮询 | - | - | - |
| T-4.1 | 北极星 10 次 demo 验证 | P0 | pending | 中 | session | - | - | - |
| T-5.1 | Cron 清理 + 文档归档 | P0 | pending | 短 | session | - | - | - |

**状态枚举**：
- `pending` — 已规划未开始
- `in_progress` — sub-agent 在做
- `self_check_done` — sub-agent 自测通过，待 PM 验收
- `done` — PM 验收通过，截图存档
- `rejected: <原因>` — PM 验收失败，需重做
- `blocked: <原因>` — 阻塞待解

---

## 3. 任务详情（每任务一段）

### T-0.0 4 个基线文档起草 + owner 签字

**产出物**（对照 plan.md）：
- [x] `/Users/njx/Project/灵犀演示/goal.md` — owner 已批准
- [x] `/Users/njx/Project/灵犀演示/plan.md` — owner 已批准
- [x] `/Users/njx/Project/灵犀演示/rules.md` — owner 已批准
- [ ] `/Users/njx/Project/灵犀演示/delivery.md`（本文档）— 待 owner 批准
- [ ] **最终签字弹窗** — 批准进入 Step 2

**验收项**（每项独立弹窗）：
- [ ] **A/4**: goal.md owner 批准（推荐 - 5 项决策 + 8 风险 + 4 Gate）
- [ ] **B/4**: plan.md owner 批准（推荐 - 17 task，并行度 87.5%）
- [ ] **C/4**: rules.md owner 批准（推荐 - 9 节完整 + 灵犀专属）
- [ ] **D/4**: delivery.md owner 批准（推荐 - 含本表 + 截图规范）

**PM 验收日志**：
```
Time: 2026-07-09 08:35 - 08:49
Verifier: PM (Mavis)
Operations:
  - 起草 goal.md（5 弹窗收敛到 PRD + 决策）
  - 起草 plan.md（17 task + 依赖图 + 风险表）
  - 起草 rules.md（9 节 + 灵犀专属）
  - 起草 delivery.md（验收清单 + 截图规范）
Result: 3/4 文档已批准，1/4 待批
Owner notified: 是 (8:49)
```

---

### T-1.0.a HTTP daemon + AIProvider 抽象层

> 占位段 — Phase 1 启动后填充

**产出物**：
- [ ] 代码：`backend/daemon/server.py`
- [ ] 代码：`backend/daemon/ai_provider.py`
- [ ] 代码：`backend/daemon/providers/cli_provider.py`
- [ ] 代码：`backend/daemon/providers/api_provider.py`
- [ ] 代码：`backend/daemon/provider_router.py`
- [ ] 测试：`backend/daemon/tests/test_*.py`
- [ ] 文档：`backend/daemon/README.md`

**验收项**（必须逐项 ✓/✗）：
- [ ] **1/6**: `pytest backend/daemon/tests` 通过（≥10 个测试用例）
- [ ] **2/6**: `python -m backend.daemon.server` 启动成功，端口监听 OK
- [ ] **3/6**: `curl http://localhost:<port>/v1/health` 返回 200
- [ ] **4/6**: `curl -X POST .../v1/chat -d '{"prompt":"hello"}'` 返回非空 content
- [ ] **5/6**: CLI 失败时 daemon 自动 fallback 到 API（健康检查 mock 验证）
- [ ] **6/6**: 截图 ≥ 3 张（启动 + 健康检查 + chat 调用 + 故障切换）

**当前状态**: pending  
**更新时间**: 2026-07-09 08:49  
**责任人**: sub-agent-daemon (待 spawn)

---

### T-1.0.b RN 桌面端脚手架（macOS+Win）

> 占位段 — Phase 1 启动后填充

**产出物**：
- [ ] 代码：`apps/desktop/package.json` + `apps/desktop/app.json`
- [ ] 代码：`apps/desktop/src/App.tsx` + `apps/desktop/src/router.tsx`
- [ ] 代码：`apps/desktop/src/theme/{light,dark}.ts`
- [ ] 配置：`apps/desktop/.electron-builder.{mac,win}.json`
- [ ] 文档：`apps/desktop/README.md`

**验收项**：
- [ ] **1/5**: `cd apps/desktop && yarn install` 成功
- [ ] **2/5**: `cd apps/desktop && yarn start` 启动 RN 桌面 app，看到欢迎页
- [ ] **3/5**: light/dark 主题切换实时生效
- [ ] **4/5**: 5 个路由占位（文件/顾问/模板/预览/输出）都渲染
- [ ] **5/5**: 截图 ≥ 3 张（启动 + light/dark 切换 + 5 路由）

**当前状态**: pending

---

### T-1.0.c 跨模块 API schema 契约

> 占位段 — Phase 1 启动后填充

**产出物**：
- [ ] 文档：`contracts/README.md`
- [ ] Schema：`contracts/{file_import,wiki_kb,advisor_question,preview_page,output_request,output_result}.schema.json`
- [ ] 验证脚本：`contracts/validate.py`

**验收项**：
- [ ] **1/4**: 6 个 schema 全部用 JSON Schema Draft 2020-12 写
- [ ] **2/4**: `python contracts/validate.py` 全绿
- [ ] **3/4**: 每个 schema 配 1 正例 + 1 反例 fixture
- [ ] **4/4**: 文档写清：模块间如何通过 schema 通讯

**当前状态**: pending

---

### T-1.1 文件管理与 LLM Wiki 知识库

> 占位段 — Phase 1 启动后填充

**产出物**：
- [ ] 代码：`apps/desktop/src/modules/file_kb/{index.tsx,importer.ts,wiki.ts,storage.ts}`
- [ ] 测试数据：`apps/desktop/testdata/`（7 格式样本 + 100M 压测样本 1 个）

**验收项**：
- [ ] **1/6**: UI 选文件/选文件夹按钮正常
- [ ] **2/6**: 7 种格式（Word/PDF/Excel/PPTX/MD/JPG/PNG）全部导入成功
- [ ] **3/6**: 100M 以内文件导入成功率 ≥ 99%（10 次压测至少 9 次成功）
- [ ] **4/6**: LLM Wiki 整理出知识点列表（标题 + 摘要 + 关联标签）
- [ ] **5/6**: 知识库仅本地（`~/Library/Application Support/灵犀演示/kb/` 或 `%APPDATA%/灵犀演示/kb/`）
- [ ] **6/6**: 截图 ≥ 3 张（UI 导入 7 格式 + 知识库整理 + 本地路径）

**当前状态**: pending

---

### T-1.2 顾问式需求交互

> 占位段 — Phase 1 启动后填充

**产出物**：
- [ ] 代码：`apps/desktop/src/modules/advisor/{index.tsx,questions.ts,voice_input.ts,kb_linker.ts}`
- [ ] Prompt 模板：`apps/desktop/src/modules/advisor/prompts/*.md`

**验收项**：
- [ ] **1/6**: UI 提问 ≥ 90% 带可选项
- [ ] **2/6**: 语音输入 macOS 准确率 ≥ 95%（10 次录音 ≥ 9 正确）
- [ ] **3/6**: 文字输入兜底，任意时刻可用
- [ ] **4/6**: AI 响应延迟 ≤ 3s（10 次压测）
- [ ] **5/6**: 知识库关联补全（用户答"主题"自动补"受众"等）
- [ ] **6/6**: 截图 ≥ 3 张（UI 提问 + 语音/文字双模 + KB 补全）

**当前状态**: pending

---

### T-1.3 模板导入与适配

> 占位段 — Phase 1 启动后填充

**产出物**：
- [ ] 代码：`apps/desktop/src/modules/template/{index.tsx,pptx_to_html.ts,style_analyzer.ts,builtin_themes.ts}`
- [ ] 测试模板：`apps/desktop/testdata/templates/`（3 套不同风格 PPTX）

**验收项**：
- [ ] **1/5**: 导入 .pptx 后 HTML 预览正确显示模板版式
- [ ] **2/5**: AI 风格分析提取出版式类型 + 主辅色 + 字体
- [ ] **3/5**: 后续生成内容 100% 匹配模板（Phase 2 端到端验证）
- [ ] **4/5**: 无模板时使用内置简约商务（浅/深双主题）
- [ ] **5/5**: 截图 ≥ 3 张（3 套模板导入 + 风格分析 JSON）

**当前状态**: pending

---

### T-1.4 HTML 预览与编辑

> 占位段 — Phase 1 启动后填充

**产出物**：
- [ ] 代码：`apps/desktop/src/modules/preview/{index.tsx,renderer.ts,editor.ts,ai_revise.ts,autosave.ts}`

**验收项**：
- [ ] **1/5**: AI 生成预览页延迟 ≤ 10s（10 次压测）
- [ ] **2/5**: 轻量编辑：改文字/改段落顺序立即生效
- [ ] **3/5**: 复杂改动：点"重做"按钮，AI 重新生成
- [ ] **4/5**: 实时保存：每 5s 自动落盘
- [ ] **5/5**: 截图 ≥ 4 张（预览生成 + 轻量编辑 + 复杂改动 + 实时保存）

**当前状态**: pending

---

### T-1.5 多格式输出

> 占位段 — Phase 1 启动后填充

**产出物**：
- [ ] 代码：`apps/desktop/src/modules/output/{index.tsx,pptx_writer.ts,pdf_writer.ts,docx_writer.ts,html_writer.ts}`
- [ ] 测试样本：`apps/desktop/testdata/outputs/`

**验收项**：
- [ ] **1/6**: PPT 类：选 1 个预览 → 同时生成 .pptx + .pdf
- [ ] **2/6**: 报告类：选 1 个预览 → 选 4 种格式之一生成成功
- [ ] **3/6**: .pptx 在 Office/WPS 可正常编辑
- [ ] **4/6**: .pdf 无格式错乱（图片/字体/版式正常）
- [ ] **5/6**: .docx 在 Word/WPS 可正常编辑
- [ ] **6/6**: 截图 ≥ 4 张（4 种格式输出 + Office 打开效果）

**当前状态**: pending

---

### T-2.1 端到端集成

> 占位段 — Phase 2 启动后填充

**产出物**：
- [ ] 代码：`apps/desktop/src/main.tsx` + `apps/desktop/src/e2e_flow.ts`
- [ ] E2E 脚本：`apps/desktop/e2e/quarterly_review.spec.ts`
- [ ] 文档：`apps/desktop/E2E_DEMO.md`

**验收项**：
- [ ] **1/3**: E2E 测试通过（5-10 文件 → 顾问 3-5 轮 → 选模板 → HTML 预览 → 4 格式输出）
- [ ] **2/3**: 手动跑 1 次季度汇报 demo 无错误
- [ ] **3/3**: 截图 ≥ 5 张关键节点

**当前状态**: pending

---

### T-2.2 PM 端到端 demo 跑通

> 占位段 — Phase 2 启动后填充

**产出物**：
- [ ] 截图：`screenshots/T-2.2/01_full_flow.png`
- [ ] 真实输出：1 份季度汇报 PPT（.pptx + .pdf）+ 1 份报告（.docx + .html）

**验收项**：
- [ ] **1/3**: PM 用 cu MCP 真实操作 app，跑通季度汇报全流程
- [ ] **2/3**: 4 种输出格式文件全部生成成功
- [ ] **3/3**: 截图 ≥ 5 张关键节点

**当前状态**: pending

---

### T-2.3 启动页动态动画 + 图标

> 占位段 — Phase 2 启动后填充

**产出物**：
- [ ] 设计稿：`apps/desktop/src/launcher/icon.svg`
- [ ] 代码：`apps/desktop/src/launcher/splash.tsx`

**验收项**：
- [ ] **1/3**: 启动页：动态展示"空白 PPT 被 AI 逐步填充"
- [ ] **2/3**: 图标：动态"零散→整合→完整"+ 微光/数据流
- [ ] **3/3**: 截图 ≥ 6 张（启动页 3 帧 + 图标 3 态）

**当前状态**: pending

---

### T-3.1 macOS 端到端

> 占位段 — Phase 3 启动后填充

**产出物**：
- [ ] 打包：`apps/desktop/dist/灵犀演示-mac.dmg`
- [ ] 截图：`screenshots/T-3.1/`
- [ ] 报告：`docs/platform-macos.md`

**验收项**：
- [ ] **1/3**: macOS 上启动安装包成功
- [ ] **2/3**: 端到端 demo 跑通 1 次
- [ ] **3/3**: 截图 ≥ 3 张

**当前状态**: pending

---

### T-3.2 Windows 端到端

> 占位段 — Phase 3 启动后填充

**产出物**：
- [ ] 打包：`apps/desktop/dist/灵犀演示-win.exe`
- [ ] 截图：`screenshots/T-3.2/`
- [ ] 报告：`docs/platform-windows.md`

**验收项**：
- [ ] **1/4**: Windows 11 上启动安装包成功
- [ ] **2/4**: 端到端 demo 跑通 1 次
- [ ] **3/4**: 路径兼容：`%APPDATA%/灵犀演示/kb/` 正确
- [ ] **4/4**: 截图 ≥ 3 张

**当前状态**: pending

---

### T-4.1 北极星 10 次 demo 验证

> 占位段 — Phase 4 启动后填充

**产出物**：
- [ ] 报告：`docs/north_star_validation.md`
- [ ] 截图：`screenshots/T-4.1/run_01.png` ~ `run_10.png`

**验收项**：
- [ ] **1/5**: 10 次 demo 全部成功
- [ ] **2/5**: 10 次结果稳定（无随机失败）
- [ ] **3/5**: 平均 HTML 预览延迟 ≤ 10s
- [ ] **4/5**: 平均 AI 响应延迟 ≤ 3s
- [ ] **5/5**: 资源占用 ≤ 8G

**当前状态**: pending

---

### T-5.1 Cron 清理 + 文档归档

> 占位段 — Phase 5 启动后填充

**产出物**：
- [ ] 清理：所有 `mavis-njx-灵犀演示-*` cron 删除
- [ ] 归档：`docs/RELEASE_NOTES.md`

**验收项**：
- [ ] **1/2**: `mavis cron list | grep 灵犀演示` 返回空
- [ ] **2/2**: Release notes 写清 5 模块 + 双平台 + 10 次 demo 全通过

**当前状态**: pending

---

## 4. 截图存档规范

### 路径约定

```
/Users/njx/Project/灵犀演示/screenshots/
├── T-0.0/
│   └── (立项无截图)
├── T-1.0.a/
│   ├── 01_before_daemon_not_started.png
│   ├── 02_daemon_started_port_xxxx.png
│   ├── 03_health_check_200.png
│   ├── 04_chat_call_response.png
│   └── 05_cli_fail_api_fallback.png
├── T-1.0.b/
│   ├── 01_before_yarn_install.png
│   ├── 02_rn_app_welcome.png
│   ├── 03_light_theme.png
│   ├── 04_dark_theme.png
│   └── 05_5_routes.png
├── ...
├── T-2.2/
│   ├── 01_full_flow_step1_import.png
│   ├── 02_step2_advisor.png
│   ├── 03_step3_template.png
│   ├── 04_step4_preview.png
│   └── 05_step5_4_formats.png
├── T-3.1/
│   └── (macOS 端到端截图)
├── T-3.2/
│   └── (Win 端到端截图)
└── T-4.1/
    ├── run_01.png ~ run_10.png
```

### 命名约定

```
<seq>_<step简写>.png

seq: 01, 02, 03...（验收顺序）
step: 一句话描述（snake_case，例: before_install / after_response / chat_call）
```

### 必拍场景

每个 task **至少 3 张**：
1. **操作前**：环境初始状态（空目录 / 启动前 / 初始页）
2. **操作中**：关键节点（命令运行中 / 页面加载中 / AI 处理中）
3. **操作后**：最终结果（成功画面 / 文件生成 / 导出完成）

**额外场景**（按需）：
- 错误时的报错截图
- 多步骤的中段状态
- 平台特有（macOS Finder 路径 / Win 资源管理器路径）

---

## 5. 验收失败记录（rejected 时填）

> 占位段 — Phase 1 启动后填充

```markdown
### ❌ T-X.Y rejected

Time: YYYY-MM-DD HH:MM
Verifier: PM-X
Round: 1 / 2 / 3

Reason:
  - 验收项 N 失败：<具体原因>
  - 截图证据：screenshots/T-X.Y/reject_01.png
  - 错误日志：<关键 stack / command output>

Sub-agent 反馈（要求 24h 内）:
  - 重做 T-X.Y
  - 保留 worktree，不要 merge
```

---

## 6. Phase 验收（owner 确认）

### Phase 0 验收（立项完成）

Time: 2026-07-09 08:49 (进行中)
Done tasks: [T-0.0 4 文档中 3 已批准，1 待最终签字]
Pending / blocked: []

Owner signature: <待弹窗>
Owner comment: <待弹窗>
Next phase go-ahead: ⏸ (待最终签字弹窗)

---

### Phase 1 验收（5 模块独立 demo + Gate 1）

Time: <待 Phase 1 完成后填>
Done tasks: [T-1.0.a, T-1.0.b, T-1.0.c, T-1.1, T-1.2, T-1.3, T-1.4, T-1.5]
Pending / blocked: []

Owner signature: <待签>
Owner comment: <待签>
Next phase go-ahead: ⏸

#### 持续运行 cron 清理记录（Phase 1 → Phase 2 切换）

| cron 名称 | 创建时间 | 清理时间 | 清理命令 |
|---|---|---|---|
| <待填> | | | |

---

### Phase 2 验收（端到端 + Gate 2）

> 占位段 — Phase 2 完成后填

---

### Phase 3 验收（双平台 + Gate 3）

> 占位段 — Phase 3 完成后填

---

### Phase 4 验收（北极星 + Gate 4）

> 占位段 — Phase 4 完成后填

---

### Phase 5 验收（收尾归档）

> 占位段 — Phase 5 完成后填

---

## 7. PRD 硬指标门卡（每个 task 必达）

> 来自 PRD 第六节"非功能性需求" + 第七节"验收标准"

| 指标 | 阈值 | 验证 task |
|---|---|---|
| 文件导入成功率（100M 以内） | ≥ 99% | T-1.1 |
| AI 交互响应延迟 | ≤ 3s | T-1.2 / T-1.4 |
| HTML 预览生成延迟 | ≤ 10s | T-1.4 / T-2.1 |
| 顾问式交互带选项比例 | ≥ 90% | T-1.2 |
| 模板适配匹配度 | 100% | T-1.3 / T-2.1 |
| 语音输入识别准确率 | ≥ 95% | T-1.2 |
| 资源占用 | ≤ 8G 内存 | T-4.1 |
| PPTX 在 Office/WPS 可编辑 | 是 | T-1.5 |
| PDF 无格式错乱 | 是 | T-1.5 |

---

## 完成度自检

- [x] 3+ 张截图规范已写
- [x] 每项验收逐项打勾（占位段已建）
- [x] 失败原因字段已定义
- [x] Changelog 已记录 8 个弹窗 + 3 个基线变更
- [x] Phase 验收段已建（5 个）
- [x] PRD 硬指标门卡表已建（9 项）

**✅ 6 项全过 → 等 owner 拍板 delivery.md + 最终签字弹窗 → 进入 Step 2**
