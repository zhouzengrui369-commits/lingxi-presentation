# 灵犀演示 · POST-MVP 12 周路线图 · 阶段 2 (W5-W8 场景产品化)

> **命名纠正 (2026-07-14 09:13 NJX 拍板)**: 本文档原命名 `PHASE2_PLAN.md` 易与 baseline `Phase 2 = Gate 2 端到端 demo` 冲突, 改名为 `POSTMVP_PRODUCTIZE_PLAN.md` 明确表示"POST-MVP" (MVP Gate 1-4 收口后) + "PRODUCTIZE" (场景产品化). MVP 范围 (goal.md baseline) = 通用工作台 + 季度汇报 first-use, 不含 1-2 航材场景. 1-2 航材场景是 12 周路线图 Phase 2 = MVP 收口后另起.
> **NJX 拍板 (2026-07-14 09:13)**: "先交付 mvp, MVP 以外的内容后移, 命名错误要纠正"

> **12 周路线图 (NJX 拍板 2026-06-10) · Phase 1 收口后下一阶段**
> 起草人: PM (Mavis) · 2026-07-14 08:48 CST
> NJX 拍板: "项目基线内 PM 自主推进" (2026-07-14 08:32)
> Phase 1 收口: 2026-07-14 08:45 (commit 53c1faf, 8 commits ahead of 840aa5e)

---

## 0. 总结

**Phase 2 目标 (NJX 12 周路线图 · W5-W8)**: 把 MVP 工作台能力**产品化到 1-2 个真实航材场景**, 接入真实数据流, 数字孪生雏形, W8 Gate = 真实用户走通"输入需求→自动跑→交付"。

**核心判断** (NJX OPC 飞轮):
- openclaw 灵犀演示 (60% 资源) = 产品出口
- 航材主业 (25%) = 真实场景"内部客户" + 现金流
- 知识库 (15%) = agent 长期记忆 + 飞轮复利
- **Phase 2 = openclaw 跟航材主业的飞轮连接点**: 灵犀演示工作台能力, 落地 1-2 个航材场景作为产品模板

---

## 1. 4 周节奏 (W5-W8)

| Week | 主题 | 关键交付 | 关键 Gate | 他参与 |
|------|------|---------|---------|--------|
| **W5** (本周) | 场景 1 选型 + 模板设计 | 1 航材场景拍板 + 模板规格文档 + 数据流 schema | 场景 1 NJX 拍板 (1h 选型会) | 场景 1 选型拍板 |
| **W6** | 场景 1 模板 + 数据流接入 | 模板代码 + 真实数据流接入 (航材系统 API / DB / 文档) + 数字孪生 v0.1 | 场景 1 E2E 1 次走通 (PM 自主) | 仅 6/12 cron + 异常时弹窗 |
| **W7** | 场景 1 收口 + 场景 2 选型 | 场景 1 W7 Gate 验收 + 场景 2 选型拍板 (NJX) + 场景 2 模板规格 | 场景 1 W7 Gate (PM 跑内部日用) | 场景 2 选型拍板 (1h) |
| **W8** | 场景 2 模板 + Gate 2 验证 | 场景 2 模板代码 + 数据流接入 + 真实用户走通 1 次 (NJX 内部 5-10 同事) | **W8 Gate = Phase 2 收口** (真实用户走通) | 真实用户验收会 (1-2h) |

---

## 2. 场景 1 候选 (NJX 拍板)

按 NJX 主业 = 航空维修 + 航材供应链数智化, 候选场景 (PM 推荐排序):

### 🅰 航材库存预警 (PM 推荐 ★★★)
- **触发**: 库存低于阈值 / 紧急 AOG (Aircraft On Ground) 需求
- **输入**: 航材清单 (Excel/CSV) + 当前库存 + 历史消耗数据
- **输出**: 预警 PPT (含补货建议) + 邮件草稿 + 工单
- **价值**: 高频 (每日/每周) + ROI 直观 (库存周转率 + 紧急需求响应) + 航材数智化核心场景
- **复杂度**: 中 (4 格式 + advisor + 模板 + 真实库存数据接入)
- **数据源候选**: 航材 ERP API / 库存 DB / Excel 导入 (跟 MVP 工作台 FileKb 模块对接)

### 🅱 维修工卡生成 (★)
- **触发**: 工程师接收维修任务 (工卡号 + 飞机号 + 故障描述)
- **输入**: 工卡基础信息 + 历史相似工卡 + 适航手册
- **输出**: 完整工卡 (步骤/工具/工时/安全提示) + 风险评估
- **价值**: 高 (适航合规 + 工程师效率) + 数字孪生雏形天然入口
- **复杂度**: 高 (需要 RAG 适航手册 + 工卡模板 + 数字孪生)
- **数据源候选**: 适航手册 (PDF/MD) + 维修历史 DB + 工卡模板库

### 🅲 季度业绩汇报 (★, 跟 MVP 场景对齐)
- **触发**: 季度/年度业绩汇报
- **输入**: KPI 数据 + 团队产出 + 客户案例
- **输出**: 业绩 PPT (4 格式) + 数据可视化
- **价值**: 已有 MVP 工作台 (季度汇报 PPT 是 first-use 场景), Phase 2 把它从内部 demo 升级为正式产品
- **复杂度**: 低 (MVP 已有能力, 接入真实数据流即可)
- **数据源候选**: 航司内部 BI / 财务系统 / 团队周报

### 🅳 供应商评估报告 (★)
- **触发**: 航材供应商年度评估
- **输入**: 供应商清单 + 交付数据 + 质量数据 + 价格数据
- **输出**: 评估报告 (含评分 + 推荐) + 对比图表
- **价值**: 中 (年度, 频次低) + 决策辅助强
- **复杂度**: 中-高 (多维度数据 + 评分模型 + 对比模板)

**PM 推荐**: 🅰 航材库存预警 (高频 + ROI + 跟 MVP 工作台 FileKb 完美对接) → W5 弹 NJX 拍板

---

## 3. 模板规格 (W5 deliverable)

无论哪个场景, Phase 2 模板规格统一为:

```
- 输入 schema (JSON Schema)
  - 业务字段 (e.g. 航材 SKU / 库存数 / 阈值 / 历史消耗)
  - 数据源 (e.g. ERP API / DB query / Excel upload)
- 输出 schema (4 格式统一)
  - PPTX (设计模板 + 业务图表)
  - PDF (CJK 字体嵌入)
  - DOCX (可编辑版)
  - HTML (web 预览)
- 工作流 steps
  - 1. 数据接入 (FileKb 拉数据)
  - 2. 顾问分析 (Advisor 3 轮 + 选项)
  - 3. 模板选择 (Template 选 builtin 或场景特定模板)
  - 4. 内容生成 (Output 4 格式)
  - 5. 数字孪生 (W7+ Phase 2.5: 实时数据接入 + 可视化)
- 验收信号
  - 真实数据接入 (不是 mock)
  - 4 格式 100% 真活 (不 fallback mock)
  - 真实用户走通 1 次 (W8 Gate)
```

---

## 4. 数据流接入 (W6 关键)

按 NJX 主业 数据源 = 航材 ERP / 维修系统 / 财务系统, Phase 2 接入策略:

### 4.1 直接接入 (优先, 跟 NJX 主业)
- 航材 ERP (具体系统 NJX 拍板)
- 维修工卡系统
- 库存 DB (如已上云)

### 4.2 文件导入 (兜底, MVP 已有)
- Excel/CSV 导入 (FileKb 已有)
- PDF 适航手册 (LLM Wiki)
- Word 历史工卡

### 4.3 数字孪生雏形 (W7+ Phase 2.5)
- 实时数据流 (WebSocket / SSE)
- 3D 飞机模型 + 工卡步骤可视化
- 维修历史时序图

---

## 5. W8 Gate 验收标准 (Phase 2 收口)

**W8 Gate = 真实用户走通"输入需求→自动跑→交付"** (NJX 12 周路线图):

```
[ ] 场景 1 真实数据接入 (不是 mock)
[ ] 场景 1 真实用户走通 1 次 (NJX 内部 5-10 同事, 至少 1 个非技术人员)
[ ] 4 格式产物 100% 真活 (PPTX/PDF/DOCX/HTML)
[ ] 端到端时长 ≤ 10 分钟 (用户主观感受)
[ ] 模板匹配 ≥ 90% (设计感知)
[ ] 顾问 ≥ 90% 选项率
[ ] 错误率 < 5% (1 次走通内)
[ ] 数字孪生雏形 v0.1 (可选, 看 W6/W7 进度)
```

---

## 6. PM 资源分配 (NJX 飞轮 60% / 25% / 15%)

| 业务 | W5 | W6 | W7 | W8 |
|------|----|----|----|----|
| openclaw 灵犀演示 Phase 2 (60%) | 场景 1 模板设计 | 场景 1 模板 + 数据流 | 场景 1 收口 + 场景 2 选型 | 场景 2 模板 + Gate 2 |
| 航材主业 (25%) | 场景 1 数据源准备 (NJX 拍板提供) | 真实数据接入测试 | 真实用户走通 1 次 | 真实用户验收会 |
| 知识库 (15%) | 模板知识沉淀 (Phase 2 模板代码) | 模板知识库化 | 场景 2 知识准备 | 数字孪生雏形知识 |

**NJX 注意力预算**:
- W5: 1h 选型会 (场景 1 拍板)
- W6: 0 (PM 自主, 6/12 cron)
- W7: 1h 选型会 (场景 2 拍板)
- W8: 1-2h 真实用户验收会
- **总计 4 周 NJX 注意力 ~3-4h, 其他 99% PM 自主**

---

## 7. 风险与降级 (W5-W8)

| 风险 | 等级 | 降级方案 |
|------|------|---------|
| 场景 1 数据源 NJX 主业系统接入受阻 | 中 | 退到 Excel 导入 (FileKb 已有), 真实数据用 NJX 提供 export sample |
| 数字孪生雏形 v0.1 复杂度超预期 | 高 | W7 末评估, 不达标跳到 W9 Phase 3 |
| 真实用户验收不达标 (错误率 ≥ 5%) | 中 | 弹 NJX 拍板: 延后 W8 Gate / 砍场景 1 复杂度 / 换场景 2 |
| 模板匹配率 < 90% | 低 | 退到 80% (NJX 设计感知拍板视角) |
| 航材主业项目突发 (NJX 注意力切换) | 高 | PM 自动接管, 跑 W5 模板设计, 跟 NJX 6/12 cron 报 |

---

## 8. POST-MVP 启动 SOP (W5 启动协议, MVP 收口后)

1. **PM 起草 4 周计划** (本文档, 2026-07-14 08:48 已完成)
2. **弹 NJX 拍 场景 1 选型** (1h, 4 选 1)
3. **NJX 拍板后, PM 派 sub-agent 起草 场景 1 模板规格** (1-2 天)
4. **场景 1 模板规格 NJX 验收** (30min)
5. **PM 派 sub-agent 跑 场景 1 模板实现 + 数据流接入** (W6, 1-2 周, 钉子 #14 worktree 隔离)
6. **场景 1 E2E 1 次走通** (PM 自主, 6/12 cron 报)
7. **场景 1 收口** (W7, 模板代码 merge main + 文档归位)
8. **场景 2 选型** (NJX 拍板, 1h)
9. **场景 2 模板 + 数据流** (W8)
10. **W8 Gate = 真实用户走通** (NJX 拍板 Phase 2 收口)
11. **Phase 3 启动** (W9-W12 Beta 化, PM 起草 Phase 3 plan)

---

## 9. Phase 1 → Phase 2 收口交付 (本次 commit)

**本地 main 已 merge 8 commits (53c1faf)**, 但 **push 受限** (GitHub HTTPS connection timeout 10s, ping OK 86ms):

| 项 | 状态 | evidence |
|----|------|----------|
| main HEAD | 53c1faf | 8 commits ahead of 840aa5e |
| 5 必做 (Wave 5) | 5/5 ✅ DONE | Wave 5 deliverable §11 |
| 9 硬指标 | 8/9 ✅ + 1/9 ⏸ DEFER + 0/9 ❌ | Verifier 独立 reproduce 30+ checks |
| 钉子 #40 5 adversarial | 5/5 ✅ | 503 E_NO_PROVIDER 实跑 + ErrorBlock + ProviderWarning + retry + isValidPdf |
| 钉子 #46 8 false-green | 8/8 ✅ | 0 voice=0.96 / 0 startDemo / 0 fakeFetch / 0 mock done / 0 PIL / 0 9/10=95% / 0 77% / cache 不计 H2 |
| 10 连跑 Gate 4 | 10/10 ✅ PASS_FALLBACK (透明) | 0 fallback_steps, 0 output_fail_runs, 累计 25.8s |
| v0.3.0 release | ✅ DONE | package.json + Info.plist + DMG 263MB sha256 byte-exact |
| macOS E2E | 28/30 ✅ PASS | 4 格式真活 / PDF CJK 嵌入 / Voice 20/20 / 3 模板 100% |
| Win 11 E2E | ⏸ BLOCKED (push 限制) | workflow 就位待 push 触发 GH Actions |
| H2 v3 真测 | ⏸ DEFERRED (key 401) | minimax.env key active for /v1/models, M3 chat 401 auth failed |
| Gate 1-4 签字 | ⏸ 待 NJX 验收 | 弹窗 NJX 启动 MVP 验收包 |

**MVP 工程层全绿**, 1 DEFERRED (H2) + 1 BLOCKED (Win push) 透明 disclose, 0 false-green。

---

## 10. Next Step (PM 自主, 钉子 #36)

1. ✅ Disable mvp-recovery-w5-review-watch cron (2026-07-14 08:48)
2. ⏳ 弹 NJX 拍 场景 1 选型 (W5 1h 选型会)
3. ⏳ Phase 2 W5 启动 (场景 1 模板设计)
4. ⏳ 持续 push 监控 (GitHub access 通则 push 触发 Win E2E)
5. ⏳ Gate 1-4 签字 (NJX 拍板 MVP 验收包)

---

**Ref**:
- `work/tasks/2026-07-13-mvp-recovery/artifacts/wave_5_deliverable.md` (Wave 5 收口报告)
- `work/tasks/2026-07-13-mvp-recovery/artifacts/wave_5_independent_acceptance.md` (Verifier 独立 reproduce 30+ checks)
- `goal.md` (12 周路线图 + 5 模块 + 9 硬指标)
- `delivery.md` (Phase 1 收口 changelog)
- `plan.md` (项目主计划 + Phase 0-5)

**Commit**: 53c1faf (本地 main, push 受限) + POSTMVP_PRODUCTIZE_PLAN.md (本文件, rename + commit amend)
