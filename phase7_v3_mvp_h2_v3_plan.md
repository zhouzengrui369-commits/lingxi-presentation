# 灵犀演示 — Phase 7.5 计划（T-MVP-2 v3 基线扩展 · H2 架构升级）

> **范围**: 把 H2 AI 响应延迟从"性能优化补丁（v1/v2）"升级为"架构级 LLM 调用方案（v3）"，覆盖流式响应 + 多 provider 路由 + 用户切模型 UI + H2 阈值重新定义 4 大改动。
> **触发**: NJX 2026-07-13 09:30 拍板"🅰 T-MVP-2 v3 全部（流式 + 多 provider + 用户切 UI + H2 重新定义，3-4 天）"+ "H2 阈值 + 架构一起升级，纳入基线吗？" = ✅ 纳入。
> **时间**: 2026-07-13 09:35 ~ T-MVP-2 v3 验收完成（不卡死时间，按质量门卡推进）。
> **质量门卡（NJX 拍板"质量优先"）**: 任一波 Wave 不通过 = 不进下一 Wave。

---

## 1. 阶段总览

```
Phase 0: 立项 (4 文档 ready + owner 签字)            ✅ DONE 2026-07-09
Phase 1: 5 模块独立 demo (Gate 1)                    ✅ DONE 2026-07-10
Phase 2: 端到端集成 (Gate 2)                         ✅ DONE 2026-07-10
Phase 3: 双平台并行 (Gate 3)                         ⚠️ macOS done / Win PARTIAL
Phase 4: 北极星 10 次 demo 验证 (Gate 4)             ⚠️ macOS half done / Win half PARTIAL
Phase 5: 收尾归档 (cron 清理 + 文档 v2)              ✅ DONE 2026-07-10 19:43
Phase 6: 真 app runtime 兑现 (Gate 5)                ✅ DONE 2026-07-11
Phase 7: 100% 交付差距收口                            ✅ DONE 2026-07-11 22:41 (T-7.1+T-7.2 merged)
   ├─ T-MVP-1 H1 wiki.ts 循环 pad 兜底 (H1 57%→100%) ✅ done (312f832)
   ├─ T-MVP-2 v1 H2 provider_router LRU cache (H2 7164ms→2ms) ✅ done (e18a1cb)
   ├─ T-MVP-2 v2 advisor 3 轮串行→并行 + 移除 cache prewarm (H2 真治本) ✅ done (fe1e1f1)
   └─ T-MVP-3 H6 real-cli 模式 N/A (mode design bug) ✅ done (469891b)

Phase 7.5: T-MVP-2 v3 baseline extension (H2 架构升级)  ← 当前阶段 ⏳ 09:35 启动
   ├─ Wave 1 · 调研 + 架构设计 (T-MVP-2-v3-W1)        ⏳ 派发中
   ├─ Wave 2 · 流式实现 + 多 provider 集成 (T-MVP-2-v3-W2)  pending
   └─ Wave 3 · 用户切 UI + H2 重新定义 + 端到端验证 (T-MVP-2-v3-W3)  pending
       ↓
Phase 8: Beta 用户自服务 (W12 Gate per 12 周路线图, 等 Phase 7.5 完成后启动)
```

| 阶段 | 起止 | Wave 数 | 并行度 | 出口标准 |
|---|---|---|---|---|
| Phase 7.5 | 2026-07-13 09:35 ~ | 3 wave (≤30min PM cap/ea) | wave 1/2 串行（依赖） | H2 真治本 (流式 + 多 provider + 用户切 UI + 阈值重定) + 9 硬指标全 PASS |

---

## 2. 任务清单

### Phase 7.5: T-MVP-2 v3 H2 架构升级 (NJX 2026-07-13 09:30 拍板)

#### T-MVP-2-v3-W1 [P0] 调研 + 架构设计 (Wave 1)

- **模块**: 架构设计 / 调研
- **依赖**: NJX 9:30 拍板已签
- **可并行**: 否（W2 依赖 W1 架构 spec）
- **预计耗时**: 30min (PM cap) / ~1-2h (subagent 实际)
- **分配给**: subagent (general / coder, worktree `feat/mvp-h2-v3`)
- **产出物**:
  - **架构 spec doc**: `docs/architecture/llm_provider_v3.md` (≥ 4000B)
    - 4 章节: 流式方案 / 多 provider 路由 / 用户切模型 UI / H2 阈值重定
    - 每章节: 选型理由 (MiniMax 官方数据 + 业内方案) + 数据流图 + 接口契约 + 兼容性矩阵
  - **provider 兼容矩阵**: `docs/architecture/provider_compat_matrix.md`
    - 行: OpenAI / Claude / Gemini / MiniMax / Ollama (本地) / 自定义 OpenAI 兼容
    - 列: 流式支持 / 工具调用 / function calling / 中文 / 延迟 P50 / 延迟 P90
  - **流式接口设计**: `contracts/llm_chat_streaming.schema.json` (JSON Schema Draft 2020-12)
  - **UI mockup spec**: `docs/architecture/provider_switch_ui.md` (用户切模型 UI 交互流程 + 截图占位)
  - **H2 重新定义 doc**: `docs/H2_THRESHOLD_REDEFINITION.md`
    - PRD 旧值: ≤ 3s avg / ≤ 5s max
    - 候选新值: P50 ≤ 800ms (首 token) / P90 ≤ 3s (full response) / P99 ≤ 8s
    - 论证: 流式后用户感知延迟 = 首 token delay, 而非 full response; 业内 Anthropic/OpenAI 流式 P50 600-1200ms
    - **锁定值（NJX 2026-07-13 11:12 拍板）**: H2 → "AI 响应流式首 token 延迟 P50 ≤ 1.5s + P90 ≤ 3.5s（宽松档）" — NJX 选 P50 ≤ 1.5s（vs PM 候选 ≤ 1.2s）/ P90 ≤ 3.5s（vs PM 候选 ≤ 3s），理由：流式后用户感知延迟 = 首 token delay；NJX 标注"宽松"，给真 LLM 6-9s 当前实际留升级空间
  - **wave 2/3 sub-plan yaml**: `/tmp/plan_t_mvp2_v3_w2.yaml` + `/tmp/plan_t_mvp2_v3_w3.yaml`
  - **worktree 验证脚本**: `scripts/verify_w1.sh` (1 命令跑 5 件套: ls docs/architecture/ + grep provider_compat + validate schema + wc -c H2 doc + 2 sub-plan yaml 存在)
- **验收信号** (PM 5-min cross-doc audit 钉子 #38):
  - [ ] `ls docs/architecture/llm_provider_v3.md` 存在 + size ≥ 4000B + mtime 今日
  - [ ] `ls docs/architecture/provider_compat_matrix.md` 存在 + 含 ≥ 5 provider 行
  - [ ] `python -c "import json; json.load(open('contracts/llm_chat_streaming.schema.json'))"` exit 0
  - [ ] `ls docs/H2_THRESHOLD_REDEFINITION.md` 存在 + 候选值表 ≥ 3 行
  - [ ] `ls /tmp/plan_t_mvp2_v3_w{2,3}.yaml` 存在
  - [ ] `bash scripts/verify_w1.sh` 全绿 (1 行命令)
  - [ ] 0 行代码改动 (`git diff main -- 'apps/desktop/**' 'backend/**' | wc -l` = 0)
- **禁红线** (钉子 #5 PRD 级 + 钉子 #14 worktree 隔离 + 钉子 #22 worktree fresh install + 钉子 #23 producer self-declare audit + 钉子 #25 path precision + 钉子 #27 PM 引用 worker 数字必自验):
  - ❌ 不写 daemon / RN 业务代码 (W2 改) — W1 只出 spec + contract + design doc
  - ❌ 不跑 `cd backend/daemon && python ...` (避免 subagent 误改跑流程)
  - ❌ 不改 4 个基线文档 (goal.md / plan.md / rules.md / delivery.md) — W3 PM 自主统一改
  - ❌ 不跑 `git push` (PM 合并 main)
  - ❌ 不 mock 截图 (本 wave 无 UI 验收, 不需要)
  - ❌ 不装新依赖 (Phase 7.5 改依赖前需 NJX 拍板 — 钉子 #5 PRD 级拆分)
  - ❌ 不破坏现有 T-MVP-2 v2 (commit fe1e1f1 已 main merge, 不要 rebase 改它)
- **失败回滚**: `git worktree remove feat/mvp-h2-v3 --force` + 重新派 W1

---

#### T-MVP-2-v3-W2 [P0] 流式实现 + 多 provider 集成 (Wave 2)

- **模块**: daemon + provider router
- **依赖**: W1 架构 spec (docs/architecture/llm_provider_v3.md) + 现有 daemon (T-1.0.a 路径)
- **可并行**: 否（W3 依赖 W2 跑通）
- **预计耗时**: 30min (PM cap) / ~2 天 (subagent 实际)
- **分配给**: subagent (coder, worktree `feat/mvp-h2-v3-w2`)
- **产出物** (待 W1 spec 出来后细化, 此处仅大纲):
  - daemon `/v1/chat/stream` 端点 (SSE 或 WebSocket, 与 W1 spec 对齐)
  - `providers/{openai,claude,gemini,minimax,ollama,custom}_provider.py` 6 个实现
  - `provider_router.py` 升级: 支持动态 provider 列表 (从 config 读) + 流式路由
  - `provider_health.py` (provider 状态监控, 用于 fallback 决策)
  - 单元测试: `tests/test_streaming_*.py` ≥ 6 个 + `tests/test_provider_*.py` ≥ 5 个
  - daemon `README.md` 更新 (流式调用示例)
- **验收信号** (待 W1 spec 落地后明确):
  - [ ] `curl -N http://localhost:PORT/v1/chat/stream?provider=minimax` 真流式 (首 token < 1.5s)
  - [ ] 6 provider 单元测试全过 (mock + 真 LLM 各一组)
  - [ ] provider 切换: config 改 provider name → daemon 自动 reload, 不需要重启
  - [ ] 流式与原 `/v1/chat` 端点并存 (向后兼容 T-MVP-2 v2)
  - [ ] 健康检查自动 fallback: 某 provider 5xx → 自动切下一个
- **禁红线**:
  - ❌ 不改 `provider_router.py` 已 merge 的 LRU cache (T-MVP-2 v1) — 那是 v2 fix 治本, 保留
  - ❌ 不破坏 advisor 3 轮并行逻辑 (T-MVP-2 v2) — 流式只在 advisor 之外启用
  - ❌ 不在 daemon 中 hardcode provider API key — 走 .env (钉子 #25 path precision)
  - ❌ 不改 RN 前端 (W3 改)
- **失败回滚**: `git worktree remove feat/mvp-h2-v3-w2 --force` + 回 W1 加 spec

---

#### T-MVP-2-v3-W3 [P0] 用户切 UI + H2 重新定义 + 端到端验证 (Wave 3)

- **模块**: RN 前端 UI + 9 硬指标回归
- **依赖**: W1 spec + W2 流式 + 多 provider 跑通
- **可并行**: 否（依赖 W2）
- **预计耗时**: 30min (PM cap) / ~1 天 (subagent 实际)
- **分配给**: subagent (coder, worktree `feat/mvp-h2-v3-w3`)
- **产出物** (待 W1 spec 细化, 此处仅大纲):
  - RN UI: `apps/desktop/src/modules/settings/provider_switch.tsx` (用户切模型入口)
  - RN UI: `apps/desktop/src/modules/settings/provider_config.tsx` (provider 配置表单)
  - 设置存储: `apps/desktop/src/state/providers.ts` (provider 列表 + 当前选中)
  - 4 文档更新: goal.md H2 重新定义 + plan.md 验收口径 + delivery.md 状态 + rules.md 约束
  - 9 硬指标 v3 验证脚本: `scripts/verify_h2_v3.mjs` (10 次真 app runtime, 含流式首 token P50)
  - 截图: `screenshots/T-MVP-2-v3/01-05_provider_switch.png` (5 张真 PNG, 用户切 6 provider 流程)
  - 钉子 #50 (v3 架构治本经验) append `mavis-runtime-discipline.md`
- **验收信号**:
  - [ ] 用户切模型 UI 跑通: 设置页 → 选 6 provider 之一 → 保存 → 重启 app 后仍保留
  - [ ] H2 新阈值真测: `node scripts/verify_h2_v3.mjs` 跑 10 次流式 demo, **P50 ≤ 1.5s + P90 ≤ 3.5s（NJX 2026-07-13 11:12 拍板，宽松档）**
  - [ ] 9 硬指标 v3 回归: H1-H9 全部跑过, 不可有 FAIL
  - [ ] 4 文档同步更新 (goal.md H2 重新定义 + delivery.md §7 硬指标表 + rules.md §9.1 + plan.md §1 阶段表)
  - [ ] 钉子 #50 写入 mavis-runtime-discipline.md (含 provider 切换最佳实践)
  - [ ] 5 张真截图存档 (cu MCP 真点击 + 截图)
- **禁红线**:
  - ❌ 不重打 DMG (T-6.8 v0.2.0 实际已装, W3 改 RN 不需要重打)
  - ❌ 不改 daemon 端 (W2 已改, W3 不动)
  - ❌ 不写流式逻辑 (W2 已写, W3 只做 UI 入口)
  - ❌ 不删 advisor 3 轮并行 (T-MVP-2 v2)
  - ❌ 不重命名 LingxiDemo → 灵犀演示 (T-6.4 已做)
- **失败回滚**: `git worktree remove feat/mvp-h2-v3-w3 --force` + 回到 W2 修

---

## 3. 依赖图

```
T-MVP-2 v2 (commit fe1e1f1, 已 main)
   ↓
T-MVP-2-v3-W1 (调研 + 架构设计) ← 9:35 派发中
   ↓
T-MVP-2-v3-W2 (流式 + 多 provider) ← 待 W1 done
   ↓
T-MVP-2-v3-W3 (UI + 阈值重定 + 验证) ← 待 W2 done
   ↓
H2 v3 验收 + Phase 7.5 签字 → Phase 8 Beta 化启动
```

**串行**: W1 → W2 → W3 严格串行（架构 spec → 业务实现 → UI 集成 + 验证）
**无并行**: 单 sub-agent 一波, 避免多 worktree 改同一 daemon 文件冲突

---

## 4. 风险登记

| # | 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|---|
| R-7.5-1 | MiniMax 官方 API 流式接口与 OpenAI 不完全兼容（tool_calls / function calling） | 中 | 高 | W1 调研出兼容矩阵, W2 写 adapter layer 隔离差异 |
| R-7.5-2 | 多 provider 健康检查引入额外 latency (每次 chat 前 ping provider) | 中 | 中 | provider_health 异步后台跑, 不在 chat 路径上 (TTL 30s) |
| R-7.5-3 | 用户切模型后 KB 关联补全 (T-1.2) 需 provider 特定 context | 中 | 中 | W3 UI 切 provider 时, 同时重置 advisor 上下文, 避免跨 provider 串味 |
| R-7.5-4 | H2 阈值重新定义 NJX 不批, 3-4 天白干 | 低 | 高 | W1 调研阶段就出候选值表 + 论证, NJX 9:30 弹窗里 W1 doc 一并呈上, NJX 提前看到阈值选项 |
| R-7.5-5 | 流式 + voice (T-6.11) 冲突: voice whisper 不在流式路径上, 但 TTS 可能冲突 | 低 | 中 | W1 spec 明确 voice 仍走非流式, TTS 流式留 Phase 8 |
| R-7.5-6 | sub-agent 跑飞 (写代码越过 W1 → W2 边界) | 中 | 中 | 禁红线写在 prompt 头部 + verifier 卡 `git diff main -- 'apps/desktop/**' 'backend/**' | wc -l` = 0 才放行 |

---

## 5. 验收门卡 (Phase 7.5 Gate 6)

| 出口项 | 阈值 | 验证方法 |
|---|---|---|
| W1 架构 spec | docs/architecture/llm_provider_v3.md ≥ 4000B + 4 章节齐 + provider_compat ≥ 5 行 | `ls + wc -c + grep` |
| W2 流式 + 多 provider | curl 流式首 token < 1.5s + 6 provider 单元测试全过 | `curl -N` + `pytest` |
| W3 UI + 阈值重定 + 9 硬指标 | 5 张真 PNG + 9 硬指标全 PASS + 4 文档同步 + 钉子 #50 | `verify_h2_v3.mjs` + grep |
| ~~NJX 拍 H2 新阈值~~ | **已拍 2026-07-13 11:12 = P50 ≤ 1.5s + P90 ≤ 3.5s**（plan.md / goal.md / phase7 plan 3 文档已同步） | 弹窗 NJX → 已完成 |

**Gate 6 准备度**: W1 + W2 + W3 全 done + NJX 拍 H2 新阈值 = Phase 7.5 ✅
**任一 FAIL = 不进 Phase 8**

---

## 6. 时间线

| 任务 | 起 | 预计止 | 依赖 |
|---|---|---|---|
| W1 调研 + 设计 | 2026-07-13 09:35 | 2026-07-13 12:00 (2.5h) | NJX 9:30 拍板 |
| NJX 审 W1 spec | 2026-07-13 12:00 | 2026-07-13 13:00 (1h) | W1 done |
| W2 流式 + 多 provider | 2026-07-13 13:00 | 2026-07-15 13:00 (2 天) | W1 NJX 批准 |
| W3 UI + 阈值 + 验证 | 2026-07-15 13:00 | 2026-07-16 13:00 (1 天) | W2 done |

**总预计**: 2026-07-13 09:35 启动, 7/16 13:00 Gate 6 验收 = **3.5 天**（与 NJX 9:30 弹窗预估 3-4 天吻合）
**不卡死时间，按质量门卡推进**（NJX 2026-07-09 拍板"质量优先"）

---

## 7. Changelog

### 2026-07-13 11:12 — H2 v3 阈值锁定（NJX 拍板"宽松"档）+ Win VM = 🅱 GitHub Actions Win runner
- Author: PM (Mavis)
- Confirmed by: NJX 2026-07-13 11:12 弹窗 reply 2 项
- 拍板内容:
  - **H2 阈值**: 流式首 token P50 ≤ 1.5s + P90 ≤ 3.5s（NJX 选宽松档 vs PM 候选 P50 ≤ 1.2s / P90 ≤ 3s）
  - **Win VM**: 🅱 GitHub Actions Win runner（解 Phase 3 T-3.2 PARTIAL pending）
- 3 文档同步 (PM 自主落基线, 不弹 NJX):
  - goal.md §5 辅助指标 H2 改写 + changelog 加 11:12 条
  - plan.md §2 T-1.2/T-3.2/T-4.1 + §5 风险表同步
  - phase7 plan §5 验证表 + §7 changelog 同步
- 教训 (PM discipline):
  - 钉子 #39 NJX 临时拍板让 PM 反思基线: 30s grep goal.md / plan.md / phase7 plan 验证范围, H2 = Phase 7.5 Gate 6 必拍项 / Win VM = 解 T-3.2 pending, **无冲突**, PM 自主落基线
  - 钉子 #5 PRD 级拆 ≤3 wave: H2 阈值属于 Gate 6 必拍项, 不弹 NJX 路由器
  - 钉子 #25 path precision: 拍板值精确到 P50/P90 数字 + "宽松" 标注
- 下一步: 弹窗 1 步问 NJX Win half 重启时机（不立即派 / 立即派 / 暂缓到 7/16 Phase 7.5 收口后）

### 2026-07-13 09:35 — Phase 7.5 立项（T-MVP-2 v3 baseline extension）
- Author: PM (Mavis)
- Confirmed by: NJX 2026-07-13 09:30 拍板 🅰 T-MVP-2 v3 全部（流式 + 多 provider + 用户切 UI + H2 重新定义，3-4 天）
- 触发链: H2 真 LLM 延迟 avg=7259ms / max=9297ms（超阈 2.4x/1.9x）→ 4 选 1 弹窗 → NJX 9:30 选 🅰 纳入基线
- 内容: 3 wave (调研+设计 / 流式+多 provider / UI+阈值+验证) + 4 文档更新 + 钉子 #50 准备
- 教训:
  - 钉子 #5 PRD 级 >30min 拆 ≤3 wave × ≤30min cap — 3-4 天拆 W1/W2/W3
  - 钉子 #14 worktree 隔离 — 3 个 wave 各独立 worktree (feat/mvp-h2-v3-w{1,2,3})
  - 钉子 #22 worktree fresh install — 钉子入 prompt 头部
  - 钉子 #23 producer self-declare audit — W1 验收时跑 5-min cross-doc audit
  - 钉子 #25 path precision — W2 禁 hardcode API key, 走 .env
  - 钉子 #27 PM 引用 worker 数字必自 grep — 验收 6 件套 (ls + wc + grep + validate)
  - 钉子 #38 5-min cross-doc audit — W1/W2/W3 done 后必跑 (server port / primary path / app bundle / user data / git status)
- 下一步: 派 W1 subagent (worktree `feat/mvp-h2-v3`, 30min PM cap, 1-2h subagent 实际)
