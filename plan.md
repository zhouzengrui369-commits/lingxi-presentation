# 灵犀演示 — 计划文档（plan.md）

> 把 goal.md 翻译成**可执行的具体行动**。每个任务都有：产出物 / 依赖 / 验收信号 / 失败回滚。
> 时间不卡死，按"质量 Gate"推进。

---

## 1. 阶段总览

```
Phase 0: 立项（goal/plan/rules/delivery 完成 + owner 确认）  ← 当前阶段
   ↓
Phase 1: 基础设施 + 5 模块独立 demo (Gate 1)
   ├─ T-0.x 基础设施 (串行，必须先做)
   └─ T-1.1 - T-1.5 五大模块 (全并行，最大化 7x24 AI 算力)
   ↓
Phase 2: 端到端集成 demo (Gate 2) — 季度汇报场景 1 次走通
   ↓
Phase 3: 双平台并行验收 (Gate 3) — macOS + Win 各跑 1 次端到端
   ↓
Phase 4: 北极星验证 (Gate 4) — 连续 10 次季度汇报 demo 零失败
   ↓
Phase 5: 交付 + 收尾（cron 清理 + 文档归档）
```

| Phase | 起止 | 任务数 | 并行度 | 出口标准 |
|---|---|---|---|---|
| Phase 0 | 2026-07-09 ~ | 4 个文档起草 | PM 串行 | owner 弹窗签字 |
| Phase 1 | TBD ~ Gate 1 | 3 基础设施 + 5 模块 = 8 | 5 模块全并行 | 单模块 demo 跑通 |
| Phase 2 | Gate 1 ~ Gate 2 | 3 集成任务 | 混合 | 端到端 1 次走通 |
| Phase 3 | Gate 2 ~ Gate 3 | 2 平台任务 | 2 sub-agent 并行 | macOS+Win 各 1 次端到端 |
| Phase 4 | Gate 3 ~ Gate 4 | 1 北极星验证 | 串行 | 10 次零失败 |
| Phase 5 | Gate 4 ~ | 1 收尾 | 串行 | cron 清理 + 文档归档 |

---

## 2. 任务清单

> **任务命名规范**：`T-<phase>.<seq> [P0/P1] 任务名`  
> **优先级**：P0 = 必做 / P1 = 阶段内增强 / P2 = 未来  
> **跟踪机制**：`轮询`（30min-2h）/ `cron`（≥2h）/ `session`（<30min）

---

### Phase 0：立项

#### T-0.0 [P0] 4 个基线文档起草 + owner 签字

- **模块**: PM 立项
- **依赖**: 无
- **可并行**: 否（必须串行：goal → plan → rules → delivery）
- **预计耗时**: PM 当前 session 内完成
- **分配给**: PM (Mavis)
- **产出物**:
  - 文档：`/Users/njx/Project/灵犀演示/goal.md`
  - 文档：`/Users/njx/Project/灵犀演示/plan.md`（本文档）
  - 文档：`/Users/njx/Project/灵犀演示/rules.md`
  - 文档：`/Users/njx/Project/灵犀演示/delivery.md`
  - 截图存档点：N/A（立项阶段无截图）
- **验收信号**:
  - [x] goal.md owner 批准（已通过，2026-07-09 08:35）
  - [ ] plan.md owner 批准
  - [ ] rules.md owner 批准
  - [ ] delivery.md owner 批准
  - [ ] 最终签字弹窗：批准进入 Step 2
- **失败回滚**: 单文档被 owner 打回 → 修改后重发弹窗

---

### Phase 1：基础设施 + 5 模块独立 demo

> **串行段（基础设施）**：T-1.0.a / T-1.0.b / T-1.0.c 必须先完成（无依赖顺序：1.0.b 脚手架可与 1.0.c schema 并行；1.0.a daemon 等脚手架起来后做）  
> **并行段（5 模块）**：T-1.1 - T-1.5 全并行，5 个 sub-agent 同时跑

#### T-1.0.a [P0] HTTP daemon + AIProvider 抽象层

- **模块**: 后端 / 基础设施
- **依赖**: 无
- **可并行**: 是（与 1.0.b 脚手架并行）
- **预计耗时**: 4-6h
- **分配给**: sub-agent-daemon
- **产出物**:
  - 代码：`backend/daemon/server.py`（FastAPI/Flask，监听 localhost:0 随机端口）
  - 代码：`backend/daemon/ai_provider.py`（抽象接口）
  - 代码：`backend/daemon/providers/cli_provider.py`（MiniMax CLI 主调用）
  - 代码：`backend/daemon/providers/api_provider.py`（MiniMax/OpenAI API 兜底）
  - 代码：`backend/daemon/provider_router.py`（主备切换逻辑：CLI 失败/超时 → API）
  - 测试：`backend/daemon/tests/test_*.py`
  - 文档：`backend/daemon/README.md`
- **验收信号**:
  - [ ] `pytest backend/daemon/tests` 通过（≥10 个测试用例）
  - [ ] 真实启动：`python -m backend.daemon.server` 启动成功，端口监听 OK
  - [ ] 真实调用：`curl http://localhost:<port>/v1/health` 返回 200
  - [ ] 真实调用：`curl -X POST http://localhost:<port>/v1/chat -d '{"prompt":"hello"}'` 返回非空 content
  - [ ] CLI 主调用路径：kill 掉 CLI 后，daemon 自动 fallback 到 API（健康检查 mock 验证）
  - [ ] 截图：daemon 启动 + 端口监听 + curl 调用 3 张
- **失败回滚**: 删除 worktree `wt-daemon`，通知 PM

#### T-1.0.b [P0] React Native 桌面端项目脚手架（macOS + Win）

- **模块**: 前端 / 基础设施
- **依赖**: 无
- **可并行**: 是（与 1.0.a daemon 并行）
- **预计耗时**: 3-5h
- **分配给**: sub-agent-frontend-scaffold
- **产出物**:
  - 代码：`apps/desktop/package.json` + `apps/desktop/app.json`
  - 代码：`apps/desktop/src/App.tsx`（入口 + 主题切换）
  - 代码：`apps/desktop/src/router.tsx`（5 模块路由占位）
  - 代码：`apps/desktop/src/theme/{light,dark}.ts`
  - 配置：`apps/desktop/.electron-builder.{mac,win}.json`（双平台打包配置）
  - 文档：`apps/desktop/README.md`
- **验收信号**:
  - [ ] `cd apps/desktop && yarn install` 成功（macOS 上跑通）
  - [ ] `cd apps/desktop && yarn start` 启动 RN 桌面 app，看到欢迎页
  - [ ] 主题切换：点击切换 light/dark，UI 实时变
  - [ ] 5 个路由占位都渲染出来（文件管理 / 顾问交互 / 模板 / 预览 / 输出）
  - [ ] 截图：RN app 启动 + light/dark 主题 + 5 路由 3 张
- **失败回滚**: 删除 worktree `wt-frontend-scaffold`，通知 PM

#### T-1.0.c [P0] 跨模块 API schema 契约

- **模块**: 接口契约 / 基础设施
- **依赖**: 无
- **可并行**: 是（与 1.0.a / 1.0.b 并行）
- **预计耗时**: 2-3h
- **分配给**: sub-agent-schema
- **产出物**:
  - 文档：`contracts/README.md`
  - Schema：`contracts/file_import.schema.json`（文件导入结果结构）
  - Schema：`contracts/wiki_kb.schema.json`（LLM Wiki 知识库条目结构）
  - Schema：`contracts/advisor_question.schema.json`（顾问提问结构，含选项）
  - Schema：`contracts/preview_page.schema.json`（HTML 预览页结构）
  - Schema：`contracts/output_request.schema.json`（输出请求结构）
  - Schema：`contracts/output_result.schema.json`（输出结果结构）
  - 验证脚本：`contracts/validate.py`（所有 schema lint 通过）
- **验收信号**:
  - [ ] 6 个 schema 全部用 JSON Schema Draft 2020-12 写
  - [ ] `python contracts/validate.py` 全绿
  - [ ] 每个 schema 配 1 个正例 + 1 个反例 fixture
  - [ ] 文档写清：模块间如何通过 schema 通讯（HTTP daemon 转发 / 文件落盘 / 消息队列）
- **失败回滚**: 删除 worktree `wt-schema`，通知 PM

#### T-1.1 [P0] 文件管理与知识库构建

- **模块**: PRD 3.1（文件管理 + LLM Wiki）
- **依赖**: T-1.0.a（daemon）/ T-1.0.c（schema）
- **可并行**: 是（与 T-1.2 / T-1.3 / T-1.4 / T-1.5 并行）
- **预计耗时**: 6-8h
- **分配给**: sub-agent-file-kb
- **产出物**:
  - 代码：`apps/desktop/src/modules/file_kb/index.tsx`（导入 UI）
  - 代码：`apps/desktop/src/modules/file_kb/importer.ts`（多格式解析）
  - 代码：`apps/desktop/src/modules/file_kb/wiki.ts`（LLM Wiki 整理）
  - 代码：`apps/desktop/src/modules/file_kb/storage.ts`（本地 SQLite/JSON 存储）
  - 真实数据：`apps/desktop/testdata/`（Word/PDF/Excel/PPTX/MD/JPG/PNG 各 1 个样本，>50M 测试样本 1 个）
- **验收信号**:
  - [ ] UI: 选文件/选文件夹按钮，点击后弹出原生选择器
  - [ ] 7 种格式全部导入成功（多模态：MD/JPG/PNG 走 OCR/VL 模型）
  - [ ] 100M 以内文件导入成功率 ≥ 99%（10 次压测至少 9 次成功）
  - [ ] LLM Wiki: 导入后自动整理出知识点列表（标题 + 摘要 + 关联标签）
  - [ ] 知识库文件仅本地（`~/Library/Application Support/灵犀演示/kb/` 或 `%APPDATA%/灵犀演示/kb/`）
  - [ ] 截图：UI 导入 7 格式 + 知识库整理结果 + 本地路径 3 张
- **失败回滚**: 删除 worktree `wt-file-kb`，保留 testdata 供下版调试

#### T-1.2 [P0] 顾问式需求交互

- **模块**: PRD 3.2（顾问交互 + 三模输入）
- **依赖**: T-1.0.a（daemon）/ T-1.0.c（schema）/ T-1.1（依赖 KB 内容做关联补全）
- **可并行**: 是（与 T-1.3 / T-1.4 / T-1.5 并行；T-1.2 部分功能可与 T-1.1 部分并行）
- **预计耗时**: 6-8h
- **分配给**: sub-agent-advisor
- **产出物**:
  - 代码：`apps/desktop/src/modules/advisor/index.tsx`（交互 UI）
  - 代码：`apps/desktop/src/modules/advisor/questions.ts`（提问模板）
  - 代码：`apps/desktop/src/modules/advisor/voice_input.ts`（语音输入，Whisper 本地或 Web Speech API）
  - 代码：`apps/desktop/src/modules/advisor/kb_linker.ts`（知识库关联补全）
  - Prompt 模板：`apps/desktop/src/modules/advisor/prompts/*.md`
- **验收信号**:
  - [ ] UI: 至少 90% 的提问带 ≥2 个可选项（卡片点击 / 单选 / 多选）
  - [ ] 语音输入：macOS 上准确率 ≥ 95%（10 次录音至少 9 次正确）
  - [ ] 文字输入：兜底，任意时刻可用
  - [ ] AI 响应流式首 token 延迟 P50 ≤ 1.5s + P90 ≤ 3.5s（**v3 升级，NJX 2026-07-13 11:12 拍板，phase7.5 落地**；旧：full response ≤ 3s avg）
  - [ ] 知识库关联：用户回答"主题=季度汇报"时，自动补全"受众=部门同事"等关联选项
  - [ ] 截图：UI 提问 + 语音/文字双模 + 知识库补全 3 张
- **失败回滚**: 删除 worktree `wt-advisor`

#### T-1.3 [P0] 模板导入与适配

- **模块**: PRD 3.3（PPTX 模板 → HTML + AI 风格分析）
- **依赖**: T-1.0.a（daemon）/ T-1.0.c（schema）
- **可并行**: 是（与 T-1.1 / T-1.2 / T-1.4 / T-1.5 并行）
- **预计耗时**: 8-10h（PPTX → HTML 转换是难点）
- **分配给**: sub-agent-template
- **产出物**:
  - 代码：`apps/desktop/src/modules/template/index.tsx`（导入 UI）
  - 代码：`apps/desktop/src/modules/template/pptx_to_html.ts`（PPTX 解析 → HTML，用 python-pptx + 自研解析）
  - 代码：`apps/desktop/src/modules/template/style_analyzer.ts`（AI 分析版式/配色/字体）
  - 代码：`apps/desktop/src/modules/template/builtin_themes.ts`（无模板时的默认浅/深双主题）
  - 测试模板：`apps/desktop/testdata/templates/`（3 套不同风格 PPTX）
- **验收信号**:
  - [ ] 导入 .pptx 后，HTML 预览能正确显示模板的版式
  - [ ] AI 风格分析：提取出版式类型（标题/正文/章节）、主色 + 辅色、字体名称
  - [ ] 后续生成内容 100% 匹配模板（验收放在 Phase 2 端到端，本任务先验证提取准）
  - [ ] 无模板时：使用内置简约商务（浅/深双主题）
  - [ ] 截图：3 套模板导入 + 风格分析 JSON 输出 3 张
- **失败回滚**: 删除 worktree `wt-template`，保留 3 套测试模板

#### T-1.4 [P0] HTML 预览与编辑

- **模块**: PRD 3.4（HTML 预览 + 轻量编辑 + 复杂改动回 AI）
- **依赖**: T-1.0.a（daemon）/ T-1.0.c（schema）/ T-1.2（依赖 advisor 拿到需求）/ T-1.3（依赖 template 风格）
- **可并行**: 部分并行（基础 UI 可先做，完整功能需 T-1.2 + T-1.3 完成后串行集成）
- **预计耗时**: 6-8h
- **分配给**: sub-agent-preview
- **产出物**:
  - 代码：`apps/desktop/src/modules/preview/index.tsx`（预览 UI）
  - 代码：`apps/desktop/src/modules/preview/renderer.ts`（基于 schema 渲染 HTML）
  - 代码：`apps/desktop/src/modules/preview/editor.ts`（轻量编辑：文字/段落/顺序）
  - 代码：`apps/desktop/src/modules/preview/ai_revise.ts`（复杂改动入口，回 AI 重新生成）
  - 代码：`apps/desktop/src/modules/preview/autosave.ts`（实时保存）
- **验收信号**:
  - [ ] AI 生成预览页延迟 ≤ 10s（PRD 硬指标，10 次压测）
  - [ ] 轻量编辑：直接改文字、改段落顺序立即生效
  - [ ] 复杂改动：点击"重做"按钮，AI 重新生成（用 advisor 拿到的新需求）
  - [ ] 实时保存：每 5s 自动落盘到本地（用户关 app 不丢）
  - [ ] 截图：预览生成 + 轻量编辑 + 复杂改动 + 实时保存 4 张
- **失败回滚**: 删除 worktree `wt-preview`

#### T-1.5 [P0] 多格式输出

- **模块**: PRD 3.5（PPT/报告多格式输出）
- **依赖**: T-1.0.a（daemon）/ T-1.0.c（schema）/ T-1.4（依赖 preview 内容）
- **可并行**: 部分并行（格式转换器可先做，最后集成）
- **预计耗时**: 6-8h
- **分配给**: sub-agent-output
- **产出物**:
  - 代码：`apps/desktop/src/modules/output/index.tsx`（输出选择 UI）
  - 代码：`apps/desktop/src/modules/output/pptx_writer.ts`（HTML → .pptx）
  - 代码：`apps/desktop/src/modules/output/pdf_writer.ts`（HTML → .pdf，用 Puppeteer 或 weasyprint）
  - 代码：`apps/desktop/src/modules/output/docx_writer.ts`（HTML → .docx）
  - 代码：`apps/desktop/src/modules/output/html_writer.ts`（直接复制预览 HTML）
  - 真实输出：`apps/desktop/testdata/outputs/`（每个 writer 跑通后留 1 个样本）
- **验收信号**:
  - [ ] PPT 类：选 1 个预览 → 同时生成 .pptx + .pdf，双格式都能用 PowerPoint/Acrobat 打开
  - [ ] 报告类：选 1 个预览 → 选 4 种格式之一，生成成功
  - [ ] .pptx 在 Office/WPS 可正常编辑
  - [ ] .pdf 无格式错乱（图片/字体/版式正常）
  - [ ] .docx 在 Word/WPS 可正常编辑
  - [ ] 截图：4 种格式输出文件 + Office 打开效果 4 张
- **失败回滚**: 删除 worktree `wt-output`，保留样本文件

---

### Phase 2：端到端集成 demo

> 依赖 Phase 1 全部完成

#### T-2.1 [P0] 端到端集成：5 模块串联

- **模块**: 集成
- **依赖**: T-1.1 / T-1.2 / T-1.3 / T-1.4 / T-1.5 全完成
- **可并行**: 否（单线程集成）
- **预计耗时**: 4-6h
- **分配给**: sub-agent-integration
- **产出物**:
  - 代码：`apps/desktop/src/main.tsx`（串联 5 模块）
  - 代码：`apps/desktop/src/e2e_flow.ts`（端到端流程状态机）
  - E2E 脚本：`apps/desktop/e2e/quarterly_review.spec.ts`（playwright 端到端测试）
  - 文档：`apps/desktop/E2E_DEMO.md`（季度汇报 demo 脚本）
- **验收信号**:
  - [ ] E2E 测试通过：导入 5-10 个文件 → 顾问交互 3-5 轮 → 选模板 → 生成 HTML 预览 → 选 4 种格式输出 → 全部成功
  - [ ] 一次季度汇报 demo 全程无错误（手动跑 1 次）
  - [ ] 截图：E2E 关键节点 5+ 张（导入完成 / 顾问提问 / 模板选择 / 预览生成 / 4 格式输出）
- **失败回滚**: 集成失败时按模块回归，找到 bug 模块打回对应 sub-agent

#### T-2.2 [P0] 真实季度汇报 demo 跑通

- **模块**: PM 验收
- **依赖**: T-2.1
- **可并行**: 否
- **预计耗时**: 1-2h
- **分配给**: PM
- **产出物**:
  - 截图：`screenshots/T-2.2/01_full_flow.png`（端到端全流程截图）
  - 真实输出：1 份季度汇报 PPT（.pptx + .pdf）+ 1 份报告（.docx + .html）
- **验收信号**:
  - [ ] PM 用 cu MCP 真实操作 app，导入 5-10 个文件，跑通季度汇报全流程
  - [ ] 4 种输出格式文件全部生成成功
  - [ ] 截图 ≥ 5 张关键节点
- **失败回滚**: demo 失败 → 回到 T-2.1 排查

#### T-2.3 [P0] 启动页动态动画 + 图标设计

- **模块**: PRD 6.1（视觉设计）
- **依赖**: 无（与 T-2.1 并行）
- **可并行**: 是
- **预计耗时**: 3-4h
- **分配给**: sub-agent-visual
- **产出物**:
  - 设计稿：`apps/desktop/src/launcher/icon.svg`（动态图标）
  - 代码：`apps/desktop/src/launcher/splash.tsx`（启动页动画）
  - Lottie/Figma 源文件
- **验收信号**:
  - [ ] 启动页：动态展示"空白 PPT 被 AI 逐步填充"过程
  - [ ] 图标：动态设计，呈现"零散 → AI 整合 → 完整 PPT" + 微光/数据流元素
  - [ ] 截图：启动页动画 3 帧 + 图标 3 态（启动/运行/完成）
- **失败回滚**: 删除 worktree `wt-visual`

---

### Phase 3：双平台并行

#### T-3.1 [P0] macOS 端到端 demo（Gate 3 之一）

- **模块**: macOS 平台验证
- **依赖**: T-2.1 端到端集成
- **可并行**: 是（与 T-3.2 Win 端并行）
- **预计耗时**: 4-6h
- **分配给**: sub-agent-macos
- **产出物**:
  - 打包：`apps/desktop/dist/灵犀演示-mac.dmg`（macOS 安装包）
  - 截图：`screenshots/T-3.1/`（macOS 端到端）
  - 报告：`docs/platform-macos.md`
- **验收信号**:
  - [ ] macOS 上启动安装包成功
  - [ ] 端到端 demo 跑通 1 次（与 T-2.2 同样流程）
  - [ ] 截图：macOS 安装包 + 启动 + 端到端 3+ 张
- **失败回滚**: 平台 bug → 打回对应模块 sub-agent

#### T-3.2 [P0] Windows 端到端 demo（Gate 3 之二）

- **模块**: Win 平台验证
- **依赖**: T-2.1 端到端集成
- **可并行**: 是（与 T-3.1 macOS 端并行）
- **预计耗时**: 4-6h
- **分配给**: sub-agent-windows（**Win VM = 🅱 GitHub Actions Win runner，NJX 2026-07-13 11:12 拍板；用 `.github/workflows/win-test.yml` 现有 workflow 跑 `windows-latest` runner，不需本地 Win VM**）
- **产出物**:
  - 打包：`apps/desktop/dist/灵犀演示-win.exe`（Windows 安装包，CI 出包）
  - 截图：`screenshots/T-3.2/`（Win 端到端，CI runner 截图 + 本地 macOS 启 VM 抓桌面）
  - 报告：`docs/platform-windows.md`
- **验收信号**:
  - [ ] Windows 11 上启动安装包成功（**CI 路径**: `windows-latest` runner 出 `.exe` + 启动 + 截图）
  - [ ] 端到端 demo 跑通 1 次
  - [ ] 路径兼容：`%APPDATA%/灵犀演示/kb/` 正确
  - [ ] 截图：Win 安装包 + 启动 + 端到端 3+ 张
  - [ ] **CI 烟测**: `.github/workflows/win-test.yml` 在 windows-latest runner 跑通（既出包又跑 e2e）
- **失败回滚**: Win 平台 bug → 打回对应模块 sub-agent
- **Win VM 决策历史**: 7/10 拍 4 选 1 调研 docs/platform-windows-vm-options.md → 7/13 11:12 NJX 拍 🅱 GitHub Actions Win runner（解 T-3.2 PARTIAL pending）

---

### Phase 4：北极星验证

#### T-4.1 [P0] 连续 10 次季度汇报 demo（Gate 4）

- **模块**: 北极星验证
- **依赖**: T-3.1 / T-3.2
- **可并行**: 否（串行 10 次）
- **预计耗时**: 3-4h（每次 15-20min）
- **分配给**: PM
- **产出物**:
  - 报告：`docs/north_star_validation.md`（10 次结果记录）
  - 截图：`screenshots/T-4.1/run_01.png` ~ `run_10.png`
- **验收信号**:
  - [ ] 10 次 demo 全部成功（每次都走完整流程）
  - [ ] 10 次结果稳定（无随机失败）
  - [ ] 平均 HTML 预览延迟 ≤ 10s
  - [ ] 平均 AI 响应流式首 token P50 ≤ 1.5s（**v3 升级，NJX 2026-07-13 11:12 拍板**）
  - [ ] 资源占用 ≤ 8G
- **失败回滚**: 任一次失败 → 回到对应 Phase 修

---

### Phase 5：交付 + 收尾

#### T-5.1 [P0] Cron 清理 + 文档归档

- **模块**: 收尾
- **依赖**: T-4.1
- **可并行**: 否
- **预计耗时**: 1h
- **分配给**: PM
- **产出物**:
  - 清理：所有 `mavis-njx-灵犀演示-*` cron 删除
  - 归档：`docs/RELEASE_NOTES.md`
- **验收信号**:
  - [ ] `mavis cron list | grep 灵犀演示` 返回空
  - [ ] Release notes 写清：5 模块均通过验收、双平台各跑通 1 次端到端、北极星 10 次零失败
- **失败回滚**: N/A

---

## 3. 依赖图

```
T-0.0 立项 ────────────────────────────→ 最终签字
                                              ↓
                            ┌─────────────────┴─────────────────┐
                            ↓                 ↓                  ↓
                       T-1.0.a           T-1.0.b            T-1.0.c
                       (daemon)       (RN 脚手架)         (schema 契约)
                            ↓                 ↓                  ↓
                            └──────┬──────────┴──────────┬───────┘
                                   ↓                     ↓
              ┌──────┬───────────┬────────┬────────────┐  │
              ↓      ↓           ↓        ↓            ↓  ↓
           T-1.1  T-1.2        T-1.3   T-1.4        T-1.5
           (KB)  (顾问)       (模板)   (预览)        (输出)
              └──────┴─────┬────┴────────┴────┬───────┘
                            ↓                  ↓
                         T-2.1 集成       T-2.3 启动页视觉（与 2.1 并行）
                            ↓
                         T-2.2 PM 端到端 demo
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
          T-3.1 macOS                T-3.2 Windows
              └─────────────┬───────────┘
                            ↓
                       T-4.1 北极星 10 次
                            ↓
                       T-5.1 收尾归档
```

**最大并行度**：
- Phase 0 = 1（PM 串行）
- Phase 1 = 5（5 模块 sub-agent 全并行，1.0.x 基础设施 3 个 sub-agent 也并行 = 8 个并行 sub-agent）
- Phase 2 = 2（集成 + 视觉）
- Phase 3 = 2（mac + win sub-agent 并行）
- Phase 4 = 1
- Phase 5 = 1

---

## 4. 并行策略（强制）

### 4.1 可以并行的任务（同 Phase 内）

- **T-1.0.a / T-1.0.b / T-1.0.c**：3 个基础设施互不依赖，全并行
- **T-1.1 - T-1.5**：5 个模块独立模块目录，独立测试，互不依赖，全并行
- **T-2.3 与 T-2.1**：视觉启动页独立于集成流水线，并行
- **T-3.1 与 T-3.2**：macOS / Windows 平台独立打包验证，并行

### 4.2 必须串行的任务

- **T-0.0 内部**：goal → plan → rules → delivery 串行（每个文档需要 owner 批准）
- **T-1.0.* → T-1.1-1.5**：基础设施必须先就绪，模块才能跑
- **T-1.* → T-2.1**：5 模块必须先各自 demo 通过
- **T-2.1 → T-2.2 → T-3.* → T-4.1**：线性串行

### 4.3 Sub-agent 隔离

- 每个 sub-agent 在独立 git worktree 工作
  - `wt-daemon` / `wt-frontend-scaffold` / `wt-schema`
  - `wt-file-kb` / `wt-advisor` / `wt-template` / `wt-preview` / `wt-output`
  - `wt-integration` / `wt-visual`
  - `wt-macos` / `wt-windows`
- 合并前 PM 跑 smoke test
- 一个 sub-agent 失败不影响其他（独立 retry）

---

## 5. 风险与阻塞跟踪

| 风险 | 触发条件 | 缓解动作 | 责任人 |
|---|---|---|---|
| 5 模块 sub-agent 接口契约漂移 | 任一模块的输入/输出 schema 与 T-1.0.c 不一致 | T-1.0.c 必须 Phase 1 第一个完成；后续模块用 schema 验证脚本 | PM |
| ~~CLI 在 Windows 上不可用~~ | **已拍 🅱 GitHub Actions Win runner (NJX 2026-07-13 11:12)** | daemon 调用 MiniMax CLI 失败时，API provider 兜底（已设计）；Win 端用 windows-latest runner 出包 + 跑 e2e | sub-agent-windows |
| PPTX → HTML 保真度差 | 模板视觉与原始差异大 | 用 python-pptx + 手工解析双路；先做基础版式（白底+文字+图片） | sub-agent-template |
| RN 桌面端组件缺失 | macOS/Win 缺少关键组件 | 用 react-native-macos + electron-shell 兜底；Phase 1 先验证 hello world | sub-agent-frontend-scaffold |
| 10 次 demo 随机失败 | 北极星验证不通过 | 增加重试 + 详细日志；逐次复盘失败点 | PM |
| 双 sub-agent 资源抢占 | 8 个 sub-agent 同时跑导致 memory / CPU 不足 | 严格控制 max_concurrency=4-5；优先级排序 daemon/scaffold/schema 先跑 | PM |

---

## 完成度自检

- [x] 所有 P0 任务有验收信号（可机器 / 人观察）
- [x] 依赖图清晰，无环
- [x] 可并行任务 ≥ 50%（Phase 1 并行度 87.5%）
- [x] 风险表 6 项
- [x] 跨模块 API schema 契约任务（T-1.0.c）放在 Phase 1 最前
- [x] 双平台并行任务（T-3.1 / T-3.2）独立 sub-agent

**✅ 6 项全过 → 进入 rules.md 起草**
