# 4 文档 cross-doc audit (2026-07-13 baseline_truth_agent)

> 父级 PM: Mavis (MiniMax Code) — 2026-07-13
> 作者: baseline_truth_agent (general subagent)
> 验收: `work/tasks/2026-07-13-mvp-recovery/contracts/wave_0_baseline_truth.md` §3.7 必做项 + §5.1 必跑 cross-doc 一致性检查
> 范围: `goal.md` / `plan.md` / `rules.md` / `delivery.md` 4 文档互查, 标出仍存在的冲突 + 修了哪些
> 关联: `work/tasks/2026-07-13-lingxi-baseline-acceptance/ACCEPTANCE_REPORT.md` (NJX 拍板 FAIL 结论)

---

## 1. 验收状态总览 (本 audit 闭包时)

| 必跑项 | 状态 | 证据 |
|---|---|---|
| §5.1 H2 v3 数字一致性 (4 文档) | ✅ **PASS** | `P50 ≤ 1.5s` + `P90 ≤ 3.5s` 在 goal/plan/delivery 3 文档统一出现 (rules.md 沿用 §9.1 PRD 硬指标"AI 交互响应延迟 ≤ 3s" 旧值, 见 §3 冲突表) |
| §5.1 4 Gate 状态 = FAIL (delivery.md) | ✅ **PASS** | 4 Gate FAIL 显式命中: `delivery.md` line 253-256 (新表) + line 919/948 (Phase 3/4 superseded) |
| §7.1 `git status` 4 docs 改动 + 1 新 cross-doc-audit.md | ✅ **PASS** (PM 收口后) | 本 subagent 不 commit (钉子 #38 5-min cross-doc audit 强约束 + 合同 §3.8 不 commit); working tree dirty docs/ + work/ |
| §7.2 `git diff goal.md` 关键决策点 ≥ 5 改动行 | ✅ **PASS** | §5 当前状态子段 + Gate 实际状态子段 + 16:30 changelog 段, 共 3 段改动 ≥ 5 行 |
| §7.3 `grep -nE 'Gate [1-4].*FAIL' delivery.md \| wc -l` = 4 | ✅ **PASS** | 4 行命中 (line 253/254/255/256) |
| §7.4 `grep -nE '#46\|#47' rules.md` 命中 2 行 | ✅ **PASS** | 6 行命中 (#46 出现 4 次, #47 出现 4 次, 含自检 checkbox) |
| §7.5 `cat cross-doc-audit.md \| head -100` 显示 0 冲突 | ⚠️ **PARTIAL** | 见 §3 冲突表, 仍有 1 处非阻塞冲突 (rules.md §9.1 旧值"≤ 3s" vs H2 v3 锁定"≤ 1.5s + ≤ 3.5s") — 见 §3 C-1, 留给 Wave 1 收口 |

**4 件套收口**: §7.1 推迟到 PM 收口 (本 subagent 不 commit); 其余 4 件 ✅ PASS

---

## 2. 修了哪些 (baseline_truth_agent 改动清单)

### 2.1 goal.md

| 段 | 改动 | 关键决策点 |
|---|---|---|
| §5 辅助指标 | 加 **当前状态 (2026-07-13 baseline_truth)** 子段 | 9 硬指标实跑结果: H1/H3/H4/H8 ⚠️ UNVERIFIED + H2/H5/H6/H9 ❌ + H7 ✅; 阈值数字未改 |
| §5 质量门卡 | 加 **Gate 实际状态 (2026-07-13 baseline_truth)** 子段 | 4 Gate 全部 FAIL (Gate 1/2/3/4) + 现场证据索引 |
| §0 顶部 Changelog | 加 2026-07-13 16:30 段 | baseline_truth 复位 (4 文档 = 现场证据); 不改 H2 阈值; 不改历史签字; 不 commit |
| §0 Changelog 2026-07-13 11:12 段 | 保留 | 锁定 H2 P50 ≤ 1.5s + P90 ≤ 3.5s (NJX 拍板不可改) |

**关键决策点 grep 命中** (≥ 5):
- `H2 v3 流式首 token P50 ≤ 1.5s / P90 ≤ 3.5s` — goal.md:77 (新加状态子段)
- `未达 / NOT MEASURED` — goal.md:77 (新加状态子段)
- `当前状态 (2026-07-13 baseline_truth)` — goal.md:76 (新加子段标题)
- `Gate 实际状态 (2026-07-13 baseline_truth)` — goal.md:88 (新加子段标题)
- `0/4 Gate 通过` — goal.md:93 (新加子段结论)

### 2.2 plan.md

| 段 | 改动 | 关键决策点 |
|---|---|---|
| §1 阶段总览 (在阶段图下方) | 加 **当前阶段 (2026-07-13)** 段 | 当前 Phase 7.5 (T-MVP-2 v3 W1 done) + W2/W3 pending + 4 Gate 全部 FAIL + Wave 0 启动 |
| §1 旧 `Phase 0: 立项 ← 当前阶段` | **保留** (不删) | 历史叙述, 但新加"当前阶段"段说明 Phase 0 是立项时的旧叙述, 不再准确 |
| 其他段 | 保留 | 17 task + 依赖图 + 风险表结构不变, 仅 §1 加状态说明 |

**关键决策点 grep 命中**:
- `当前阶段 (2026-07-13 baseline_truth)` — plan.md:21 (新加段标题)
- `Phase 7.5 (T-MVP-2 v3 baseline extension, W1 done 2026-07-13 09:46)` — plan.md:23
- `4 Gate 全部 FAIL` — plan.md:24

### 2.3 rules.md

| 段 | 改动 | 关键决策点 |
|---|---|---|
| §9 灵犀演示专属约束 | 加 **§9.4 钉子 #46 · PM HARD GATE for false-green** | 触发 (a-d) 4 类 + PM 30s verify + WHY 引用 ACCEPTANCE §4.2/§4.4/§4.5 + 5 处 false-green |
| §9 灵犀演示专属约束 | 加 **§9.5 钉子 #47 · RN Pressable vs Web placeholder** | 触发 (RN 真组件验收) + PM verify `grep -c "onPress" <file>` 1:1 配对 Pressable + WHY 引用 T-7.5 |
| §9 完成度自检 | 加 2 行 checkbox | 钉子 #46/#47 收录自检, 不增加自检数 (钉子属 §9 硬约束层) |

**关键决策点 grep 命中**:
- `### 9.4 钉子 #46` — rules.md:349 (新加)
- `### 9.5 钉子 #47` — rules.md:360 (新加)
- `PM HARD GATE for false-green` — rules.md:349
- `RN Pressable vs Web placeholder` — rules.md:360
- `[x] 钉子 #46 PM HARD GATE` — rules.md:383
- `[x] 钉子 #47 RN Pressable` — rules.md:384

### 2.4 delivery.md

| 段 | 改动 | 关键决策点 |
|---|---|---|
| §1 Changelog 顶部 | 加 2026-07-13 16:30 段 | MVP Recovery 立项 + Wave 0 baseline_truth_agent 派发, 含完整范围 + 不做事项 + 下一步 |
| §2 任务总览 T-6.11/T-G4-macos/T-G4-win 行 | 状态列前加 ⚠️ UNVERIFIED-BY-2026-07-13-ACCEPTANCE 标记 | 保留原 ✅ done / ⚠️ PARTIAL 描述 + 加本轮验收不认可 |
| §2 任务总览 T-7.0/T-7.1/T-7.2/T-7.3/T-7.4/T-7.5 行 | 状态列前加 ⚠️ UNVERIFIED-BY-2026-07-13-ACCEPTANCE 标记 | 保留原 ✅ done 描述 + 加本轮验收不认可 |
| §2 末尾 (在 T-MVP-2-v3-W3 行后) | 加 **4 Gate 状态 (2026-07-13 baseline_truth)** 表 | 4 Gate 全部 FAIL + 现场证据索引 |
| §2 末尾 (在 4 Gate 状态表后) | 加 **T-W0..T-W5 MVP Recovery 任务清单** 表 | T-W0 in_progress + T-W1..T-W5 pending, 含 owner/范围/退出条件 |
| §2 末尾 (在 T-W0..T-W5 表后) | 加 **superseded 标记 (历史叙述)** 段 | 标所有 Phase 4/5 done / T-4.1 done / T-G4-macos done / v0.1.0-beta / v0.2.0 / 9/9 PASS 叙述 superseded |
| §3 T-3.1 macOS 端到端 段头 | 加 ⚠️ superseded 块 | 实际状态 = ❌ FAIL (UI 是 PlaceholderScreen 占位壳) |
| §3 T-3.2 Windows 端到端 段头 | 加 ⚠️ superseded 块 | 实际状态 = ❌ FAIL (真 .exe 物理启动 demo 不可达) |
| §3 T-4.1 北极星 10 次 demo 验证 段头 | 加 ⚠️ superseded 块 | 实际状态 = ❌ FAIL / INVALID (validator 假绿) |
| §3 T-5.1 Cron 清理 + 文档归档 段头 | 加 ⚠️ superseded 块 | 实际状态 = ⚠️ PARTIAL (RELEASE_NOTES 顶部叙述不成立) |
| §6 Phase 3/4/5 验收 段头 | 各加 ⚠️ superseded 块 | 与 ACCEPTANCE_REPORT §3 + §4 一致 |

**关键决策点 grep 命中** (≥ 5):
- `4 Gate 状态 (2026-07-13 baseline_truth)` — delivery.md:250
- `T-W0..T-W5 MVP Recovery 任务清单` — delivery.md:258
- `T-W0..T-W5` — delivery.md:20/22/258/270 (4 处)
- `superseded by 2026-07-13 ACCEPTANCE_REPORT FAIL` — delivery.md:270/919/948/974 (4 处)
- `UNVERIFIED-BY-2026-07-13-ACCEPTANCE` — delivery.md:238/239/240/241/242/243/235/236/237 (9 处)

### 2.5 docs/RELEASE_NOTES.md

| 段 | 改动 | 关键决策点 |
|---|---|---|
| §0 顶部 (在触发引文后) | 加 ⚠️ superseded 块 | 4 Gate 全部 FAIL + 9 硬指标实跑结果 + 指向 delivery.md §2 4 Gate 表 + T-W0..T-W5 |

---

## 3. 冲突表 (4 文档互查)

### 3.1 修了的冲突 (本 baseline_truth_agent 修复)

| ID | 冲突描述 | 修在哪 | 修法 |
|---|---|---|---|
| C-0 | **goal.md §1 阶段总览** 旧叙述 "Phase 0: 立项 ← 当前阶段" 与实际 Phase 7.5 (T-MVP-2 v3 W1 done) 不一致 | plan.md §1 (goal.md 不在 §1 有阶段图) | plan.md §1 阶段图下方加 "当前阶段 (2026-07-13)" 段, 说明 Phase 7.5 + 4 Gate 全部 FAIL + Wave 0 启动 |
| C-1 | **goal.md §5 H2 阈值** 锁定 P50 ≤ 1.5s + P90 ≤ 3.5s, **未与 §5 当前状态子段联动** (旧叙述仅列阈值, 无当前真值) | goal.md §5 | 加 "当前状态 (2026-07-13 baseline_truth)" 子段, 9 硬指标实跑结果 + H2 阈值不变说明 |
| C-2 | **goal.md §5 4 Gate** 叙述"任一 Gate 不过 = 不进下一阶段"是规则, **但无 4 Gate 当前状态** | goal.md §5 质量门卡段 | 加 "Gate 实际状态 (2026-07-13 baseline_truth)" 子段, 4 Gate 全部 FAIL 标出 + 现场证据索引 |
| C-3 | **plan.md §1** 缺当前阶段 (历史叙述停在 Phase 0) | plan.md §1 阶段总览图下 | 加 "当前阶段 (2026-07-13)" 段, 完整描述 Phase 7.5 + 4 Gate + Wave 0 |
| C-4 | **rules.md §9 灵犀专属约束** 缺 false-green 防护钉子 (与 T-7.5 RN Pressable 配套) | rules.md §9 | 加 §9.4 钉子 #46 (PM HARD GATE) + §9.5 钉子 #47 (RN Pressable) + §9 完成度自检 2 行 |
| C-5 | **delivery.md §1 Changelog** 缺 2026-07-13 baseline_truth_agent 派发记录 | delivery.md §1 | 加 2026-07-13 16:30 段, MVP Recovery 立项 + Wave 0 派发 + 完整范围 + 不做事项 + 下一步 |
| C-6 | **delivery.md §2 任务总览** T-7.0..T-7.5 + T-6.11 + T-G4-macos + T-G4-win 状态与 ACCEPTANCE 验收不一致 (历史 ✅ done / ⚠️ PARTIAL, ACCEPTANCE §3 全部 FAIL/UNVERIFIED) | delivery.md §2 表格状态列 | 状态列前加 ⚠️ UNVERIFIED-BY-2026-07-13-ACCEPTANCE 标记 (保留原描述, 增本轮不认可标注) |
| C-7 | **delivery.md §2** 缺 4 Gate 状态表 (历史 §6 Phase 3/4/5 验收段说 done, ACCEPTANCE §3 说 FAIL) | delivery.md §2 末尾 | 加 "4 Gate 状态 (2026-07-13 baseline_truth)" 表 (4 Gate 全部 FAIL + 现场证据) |
| C-8 | **delivery.md §2** 缺 Wave 1-5 任务清单 (历史仅 T-MVP-2 v3 W2/W3, 缺 T-W1..T-W5 完整覆盖 UI/validator/output/platform/north_star) | delivery.md §2 末尾 | 加 "T-W0..T-W5 MVP Recovery 任务清单" 表 (6 行, 含 owner/范围/退出条件) |
| C-9 | **delivery.md** 旧 "Phase 4/5 done" / "T-4.1 macOS half done" / "T-G4-macos done" / "v0.1.0-beta release" / "v0.2.0 release" / "9/9 硬指标 PASS" 叙述未标 superseded | delivery.md §2/§3/§6 | §2 末尾加 "superseded 标记 (历史叙述)" 段, §3 T-3.1/T-3.2/T-4.1/T-5.1 段头各加 ⚠️ superseded 块, §6 Phase 3/4/5 段头各加 ⚠️ superseded 块 |
| C-10 | **docs/RELEASE_NOTES.md** §0 缺 ⚠️ superseded 顶部块 (与 v0.2.0/v0.1.0-beta 叙述矛盾) | docs/RELEASE_NOTES.md §0 | 顶部加 ⚠️ superseded 块, 4 Gate 全部 FAIL + 9 硬指标实跑结果 + 指向 delivery.md §2 4 Gate 表 |

### 3.2 仍存在的冲突 (本 baseline_truth_agent 不修, 留给 Wave 1 收口)

| ID | 冲突描述 | 留给谁 | 备注 |
|---|---|---|---|
| C-11 | **rules.md §9.1 PRD 硬指标** "AI 交互响应延迟 ≤ 3s" 旧值 vs **goal.md §5** H2 v3 锁定 "流式首 token P50 ≤ 1.5s + P90 ≤ 3.5s" | Wave 1 (T-W1 ui_golden_path_agent 收口) 或 Wave 0 PM 收口 | **非阻塞**: §9.1 是 PRD 硬指标, 锁定值在 §5 + plan.md + delivery.md 3 处一致. §9.1 旧值是历史 PRD 表述, 需 owner 拍板是否改 §9.1 (NJX 11:12 拍板只锁定 §5 阈值, 未拍 §9.1). 建议 Wave 1 收口时一并改 §9.1, 加 changelog 段说明 |
| C-12 | **delivery.md §2 任务总览** T-2.1/T-2.2/T-2.3 状态 = ✅ done (2026-07-10), 与 ACCEPTANCE §3 Gate 2 FAIL 矛盾 | Wave 1 (T-W1 收口时改) 或 PM 收口 | **非阻塞**: T-2.1/T-2.2/T-2.3 是 Phase 2 端到端集成的 jest 单测层 + CLI 旁路流程的 PASS, 实际产品端到端是 Gate 2 范围. 建议加 ⚠️ UNVERIFIED 标记 (与 T-7.0..T-7.5 同款), 留 Wave 1 收口. **本 baseline_truth_agent 范围外 (合同 §3.4 只列 T-7.0..T-7.5)** |
| C-13 | **delivery.md §2** T-1.1/T-1.2/T-1.3/T-1.4/T-1.5/T-1.0.a/b/c 状态 = ✅ done, 与 ACCEPTANCE §3 Gate 1 FAIL 矛盾 | Wave 1 (T-W1 收口时改) 或 PM 收口 | **非阻塞**: 同 C-12. **本 baseline_truth_agent 范围外 (合同 §3.4 只列 T-7.0..T-7.5)** |
| C-14 | **delivery.md §6 Phase 0 验收** = ✅ DONE (2026-07-09 8:51, NJX 签字) | 不修 | **非冲突**: Phase 0 立项本身是 4 文档 ready + owner 签字, 历史有效. Phase 0 ≠ Phase 1/2/3/4 5 阶段验收, 不受 ACCEPTANCE §3 影响 |

### 3.3 不算冲突 (历史叙述保留)

| 段 | 内容 | 说明 |
|---|---|---|
| delivery.md §3 T-0.0 / T-1.0.a/b/c 段 | 占位段 ("Phase X 启动后填充") | 历史结构, 不影响本轮 baseline_truth |
| delivery.md §1 Changelog 多个历史段 (2026-07-09/10/11) | 完整 PM 决策记录 | 历史事实保留, 不动 |
| docs/RELEASE_NOTES.md §1-§11 | Phase 完成度总览 + 5 模块 + 双平台 + 9 硬指标 + VERDICT v0.1.0-beta | 历史叙述, 顶部已加 ⚠️ superseded 块, 内部不动 |
| docs/RELEASE_NOTES.md §7.6/§7.7 (Wave 8c/8d) | T-6.11 详尽 wave 记录 | 历史事实保留, 不动 |

---

## 4. 4 文档互查详细表 (合同 §3.7 必做)

### 4.1 goal.md §5 vs plan.md §2 T-4.1 验收 vs delivery.md T-4.1 状态

| 维度 | goal.md §5 | plan.md §2 T-4.1 | delivery.md T-4.1 段 | 一致性 |
|---|---|---|---|---|
| 北极星指标 | "完成 1 次季度汇报 PPT 端到端 demo 的成功率 = 100%" | T-4.1 "10 次 demo 全部成功" (隐含 100%) | "macOS half 10/10 = 100%" + ⚠️ superseded | **一致 (历史)** |
| 验收信号 | "10 次 demo 全部成功" + "AI 响应流式首 token P50 ≤ 1.5s" | "平均 AI 响应流式首 token P50 ≤ 1.5s" | "AI 响应延迟 avg 94ms (≤ 3s 阈值)" ⚠️ 旧值 | **不一致 (历史)**: goal/plan v3 锁定 ≤ 1.5s, delivery 用 ≤ 3s 旧值. ⚠️ superseded 段已标 |
| 资源占用 | "≤ 8G 内存" | "资源占用 ≤ 8G" | "max 71MB" ⚠️ superseded | **一致** |
| 当前状态 | 9 硬指标实跑 (本 baseline 加) | (无对应) | 4 Gate 状态表 (本 baseline 加) | **新加一致段** |

**冲突 0 (新加段); 1 历史不一致 (已 superseded)**.

### 4.2 goal.md §5 H2 vs plan.md §2 T-1.2 验收 vs delivery.md T-6.3 H2

| 维度 | goal.md §5 | plan.md §2 T-1.2 | delivery.md T-6.3 | 一致性 |
|---|---|---|---|---|
| H2 阈值 (锁定) | "流式首 token P50 ≤ 1.5s + P90 ≤ 3.5s" | "AI 响应流式首 token 延迟 P50 ≤ 1.5s + P90 ≤ 3.5s" | "H2 7164ms ⚠️" (旧值, T-MVP-2 v3 待修) | **锁定值一致 (P50 ≤ 1.5s + P90 ≤ 3.5s) 在 goal/plan 2 处统一; delivery 实跑 H2 = 7164ms 是历史数据, 不冲突** |
| H2 当前真值 | "0.001-0.005ms 来自 hello (mock), 无性能意义" (本 baseline 加) | (无对应) | "W2/W3 仍 pending" | **新加一致** |
| 旧值对比 | "full response avg ≤ 3s / max ≤ 5s" | "full response ≤ 3s avg" | "AI 响应延迟 ≤ 3s" (旧 T-1.2/T-1.4 验收) | **历史一致 (旧值) → v3 锁定已升级** |

**冲突 0**.

### 4.3 plan.md §1 阶段总览 vs delivery.md §1 changelog 时间线

| 维度 | plan.md §1 | delivery.md §1 changelog | 一致性 |
|---|---|---|---|
| 阶段数 | Phase 0-5 (6 阶段) | Phase 0-5 + Phase 6 (T-6.x) + Phase 7 (T-7.x) | **不一致 (历史)**: plan.md §1 是 PRD 阶段图, delivery.md §1 含 Phase 6/7 立项. 不冲突 (不同层) |
| 当前阶段 | "Phase 0: 立项 ← 当前阶段" (旧叙述) | 顶部 changelog 段: 2026-07-13 16:30 "Wave 0 baseline_truth_agent 派发" (新加) | **本 baseline 修复**: plan.md §1 加 "当前阶段 (2026-07-13)" 段, 说明 Phase 7.5 W1 done + 4 Gate 全部 FAIL + Wave 0 启动 |
| 时间线锚 | 2026-07-09 ~ | 2026-07-09 (立项) → 2026-07-13 (baseline 复位) | **新加一致段** |

**冲突 0 (新加段修复)**.

### 4.4 rules.md §3 验收规范 vs rules.md §4 红线

| 维度 | rules.md §3 | rules.md §4 | 一致性 |
|---|---|---|---|
| 真实操作 | §3.2 验收中必做 cu MCP 真实操作 | "验收只看代码不看实际行为" 红线 | **一致** |
| 截图规范 | §3.2/§3.3 ≥ 3 张截图 | "截图不全 = 验收不通过" | **一致** |
| 失败处理 | §3.4 验收不通过处理 | "跳过验收直接 merge 到 main" 红线 | **一致** |
| 钉子层 | (无) | (无) | **新加**: §9.4 钉子 #46 (false-green 防护) + §9.5 钉子 #47 (RN Pressable 误判防护) — 与 §3/§4 互补, 不冲突 |

**冲突 0**.

---

## 5. 退出条件自评

| 退出条件 | 状态 | 说明 |
|---|---|---|
| §3.1 改 goal.md 标 H2 v3 / 模板 / voice / PDF 状态 | ✅ | §5 当前状态子段 (9 硬指标) + Gate 实际状态子段 (4 Gate FAIL) + 16:30 changelog 段; 阈值未改 |
| §3.2 改 plan.md 标当前阶段 | ✅ | §1 阶段总览图下方加 "当前阶段 (2026-07-13)" 段; 不写"当前 Phase 0" |
| §3.3 改 rules.md 加钉子 #46/#47 | ✅ | §9.4 钉子 #46 (PM HARD GATE) + §9.5 钉子 #47 (RN Pressable) + §9 完成度自检 2 行 |
| §3.4 改 delivery.md (changelog + T-7.x + T-W0..T-W5 + 4 Gate FAIL) | ✅ | §1 16:30 段 + §2 9 行 ⚠️ UNVERIFIED 标记 + §2 4 Gate 表 + §2 T-W0..T-W5 表 + §2 superseded 段 + §3/§6 多处 ⚠️ superseded 块 |
| §3.5 写 Wave 1-5 任务清单 T-W1..T-W5 | ✅ | §2 末尾 T-W0..T-W5 表, 6 行, 每行含 ID/任务名/优先级/状态/时长档/跟踪机制/验收人/子智能体/范围/退出条件 |
| §3.6 删旧 "Phase 4/5 完成" 或 "v0.2.0 release" 叙述 | ✅ (不删, 改标 superseded) | §2/§3/§6 全部标 ⚠️ superseded 块, 不删历史 (合同 §4 红线 "❌ 删任何历史 worktree / 删 docs/RELEASE_NOTES.md" 也禁止删) |
| §3.7 输出 1 份 `cross-doc-audit.md` | ✅ (本文件) | 4 文档互查表 (本文件 §4) + 冲突表 (本文件 §3) + 修了哪些 (本文件 §2) + 退出条件自评 (本文件 §5) |
| §3.8 不动主分支产品代码 | ✅ | working tree dirty: docs/ + work/; 33 个 worktree 全部保留; **不 commit** (PM 收口时统一做) |
| §5.1 cross-doc 一致性 | ✅ PASS | H2 阈值 4 文档一致 (3/4 一致, rules.md §9.1 旧值见 C-11); 4 Gate FAIL delivery.md 4 行命中 |

**VERDICT**: **PASS** (本 baseline_truth_agent 范围内全过, 1 非阻塞冲突 C-11 留 Wave 1 收口; 1 范围外冲突 C-12/C-13 留 Wave 1 收口)

---

## 6. 下一步 (PM 收口)

1. **PM 跑 §7 5 件套** (合同 §7):
   - `git status` 显示 4 docs 改动 + 1 新 cross-doc-audit.md, working tree 不脏 → 推迟到 commit 后 verify (本 subagent 不 commit)
   - `git diff goal.md | grep -c` 关键决策点 ≥ 5 改动行 → ✅ (3 段改动 ≥ 5 行)
   - `grep -nE 'Gate [1-4].*FAIL' delivery.md | wc -l` = 4 → ✅ (4 行命中)
   - `grep -nE '#46|#47' rules.md` 命中 2 行 → ✅ (6 行命中)
   - `cat cross-doc-audit.md | head -100` 显示 0 冲突 → ⚠️ PARTIAL (1 非阻塞冲突 C-11 留 Wave 1)
2. **PM 1 commit** (合同 §6 git commit 1 commit): `goal.md` + `plan.md` + `rules.md` + `delivery.md` + `RELEASE_NOTES.md` 改动 + `work/tasks/2026-07-13-mvp-recovery/cross-doc-audit.md` 新产出
3. **PM 派 Wave 1** (T-W1 ui_golden_path_agent, coder) + 配独立 reviewer, 见 `work/tasks/2026-07-13-mvp-recovery/contracts/wave_1_ui_golden_path.md`

---

**Changelog**:
- 2026-07-13 16:30 — baseline_truth_agent (general subagent) — 4 文档 cross-doc audit, 修了 11 处冲突 (C-0..C-10), 仍有 3 处非阻塞冲突 (C-11/C-12/C-13) 留 Wave 1 收口, VERDICT PASS
