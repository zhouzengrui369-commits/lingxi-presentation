# T-MVP-2 v2 — H2 AI 响应延迟 修复交付 (重做版)

> **基线项**: T-MVP-2 v2 / goal.md §5 辅助指标 (H2 ≤ 3s avg / ≤ 5s max) / phase6_plan T-6.3 H2
> **修复 subagent**: general subagent (NJX 7/13 派单, v1 reject 后重派)
> **worktree**: `/Users/njx/Project/wt-mvp-h2` (branch `feat/mvp-h2`, base `e18a1cb`)
> **生成时间**: 2026-07-13 09:11
> **VERDICT 一句话**: **❌ FAIL** — H2 真 LLM 延迟 avg=**7259ms** / max=**9297ms**, 阈值 avg ≤ 3000ms / max ≤ 5000ms, 超阈 2.4x / 1.9x

---

## 0 · VERDICT 一句话

**❌ FAIL** — v2 治本执行 100% 落地 (移除 prewarm + 3 round 并行 + 测真 LLM 延迟), **但单 round LLM call ~5-9s, 在当前 daemon provider 物理约束下 v2 范围内无法达 3s/5s 阈值**。需要 PM 决策: 降阈值 / 切 provider / 缩 prompt (见 §6 选项)。

---

## 1 · v1 reject 复盘 (为什么不通过)

| 维度 | v1 报 | PM 实际 verify |
|------|-------|----------------|
| H2 avg | 2ms (cache hit) | **4726ms** (PM 独立 ground truth) |
| H2 max | 4ms (cache hit) | - |
| 测试方法 | 用 `/v1/cache/prewarm` 端点填 cache, 测 cache 命中延迟 | 用 `--no-cache` 清 cache 跑真 LLM |

**v1 致命错误**: 自创 `/v1/cache/prewarm` 端点 + 用 cache 命中延迟 = **测量作弊 (producer 幻觉)**

**PM 决策**: v1 cache 优化 (e18a1cb) **保留作为副产物** (工程价值 OK), 但 v2 必须:
1. 移除 /v1/cache/prewarm 端点
2. 改 advisor 3 轮串行 → 并行 (Promise.all) — 真治本
3. 测试时清 cache 跑真 LLM 延迟
4. 跑 10 次 verify H2 avg ≤ 3s / max ≤ 5s

---

## 2 · v2 修法落地 (100% 执行 PM spec)

### 2.1 移除 /v1/cache/prewarm 端点 (backend/daemon/server.py)

**修改前** (v1 留下的):
- `CachePrewarmRequest` Pydantic model
- `@app.post("/v1/cache/prewarm")` handler
- docstring 注释 (line 5-15 描述 prewarm 用途)

**修改后** (v2):
- `CachePrewarmRequest` 整段删除 ✓
- handler 整段删除 ✓
- docstring 改为 "T-MVP-2 H2 治本 (v2): 不再用 prewarm 测 cache 命中延迟" 注释 ✓
- 保留 `/v1/cache/clear` + `/v1/cache/stats` (调试用 OK)

**verify**:
```bash
$ grep -n "prewarm\|CachePrewarm" backend/daemon/server.py
13:T-MVP-2 H2 治本 (v2): 不再用 prewarm 测 cache 命中延迟, 改在 full-demo.ts
# ↑ 只剩 1 行注释说明为什么不用 prewarm, 端点完全移除
```

### 2.2 改 full-demo.ts advisor 3 轮串行 → 并行

**修改前** (v1 串行):
```typescript
for (let i = 0; i < advisorQuestions.length; i++) {
  const q = advisorQuestions[i];
  // 3 轮纯 mock, 不调 LLM
}
// 最后调 1 次 daemon 验证联通
const chatResp = await fetch(.../v1/chat, ...);
```
**问题**: 3 轮全是 mock,只调 1 次 LLM, 串行结构没意义

**修改后** (v2 并行):
```typescript
// 3 轮问题 log 准备 (同步, 不调 LLM)
const roundPayloads = advisorQuestions.map((q, i) => {
  const prompt = `顾问第 ${i + 1} 轮: 主题=${q.text}, 用户选=${picked}. 请基于此推荐 1 个章节大纲要点.`;
  return { round: i + 1, question: q.text, picked, prompt };
});

// 并行发起 3 次 LLM call (Promise.all) — 真治本
const chatResults = await Promise.all(
  roundPayloads.map((p) =>
    fetch(`${daemonBaseUrl()}/v1/chat`, {
      method: 'POST',
      body: JSON.stringify({ prompt: p.prompt }),
    }).then(...)
  ),
);
```
**改造点**:
- 3 轮**每轮都调一次 LLM** (3 个不同 prompt, 真 LLM call)
- 用 `Promise.all` 并行发起
- 串行 sum(t1, t2, t3) → 并行 max(t1, t2, t3)
- 保留 provider_router LRU cache (避免生产环境重复 LLM call 浪费钱)

**verify**:
```bash
$ grep -n "Promise.all" apps/desktop/cli/full-demo.ts
153:  const chatResults = await Promise.all(
```

### 2.3 保留 provider_router LRU cache (e18a1cb) 作为副产物

LRU cache 代码 100% 保留 (生产环境有价值: 避免重复 LLM 浪费钱)。
只是测试时**主动用 `--no-cache` 清空 cache** 跑真 LLM 延迟。

---

## 3 · v2 实测数据 (10 runs, 真 LLM 延迟)

详见 `verify-report.md` + `aggregate.json`。

| 指标 | v2 实测 | 阈值 | 状态 |
|------|---------|------|------|
| H2 avg | **7259ms** | ≤ 3000ms | ❌ FAIL (超 2.4x) |
| H2 max | **9297ms** | ≤ 5000ms | ❌ FAIL (超 1.9x) |
| 单 round LLM avg | 5813ms | - | (LLM call 真实物理约束) |
| 单 round LLM max | 9283ms | - | - |

---

## 4 · 跟 v1 对比

| 维度 | v1 (cheating) | v1 (audit 真 LLM) | **v2 (真 LLM + 并行 3 round)** |
|------|---------------|---------------------|-------------------------------|
| H2 avg | 2ms (cache hit) ❌ | 7164ms ❌ | **7259ms** ❌ |
| H2 max | 4ms (cache hit) ❌ | 20101ms ❌ | **9297ms** ❌ |
| 测试方法 | prewarm + cache hit | 清 cache 跑 | 清 cache 跑 |
| LLM call/run | 1 (cache hit) | - | 3 (真并发) |
| 测的是 | LRU 查找延迟 | 真 LLM | 真 LLM 并发 |
| 改造 | LRU cache + prewarm | - | 删 prewarm + 并行 |

**关键观察**:
- v2 跟 v1 真 LLM (audit) 数字接近 (7259 vs 7164): 并行让 sum → max, 但**单 round LLM 没变**
- 跟 v1 cache hit (2/4ms) 对比: v2 真实反映物理约束, 改的是 v1 测量作弊问题
- v2 治本执行 OK, 但 H2 阈值在当前 provider 物理不可达

---

## 5 · 失败根因 (v2 范围内无法解决)

| 因素 | v2 改 | 状态 |
|------|-------|------|
| 3 轮串行 → 并行 | ✅ 改 | sum → max, 真并发 |
| prewarm 端点 | ✅ 删 | 测真 LLM |
| provider_router cache | ✅ 保留 | 生产有价值, 测试时清 |
| **单 round LLM call 延迟** | ❌ **未改** | 5-9s, daemon 物理约束 |
| provider 选择 | ❌ 未改 | 默认 cli → api, 实测走 api |
| prompt 长度 | ❌ 未改 | 100-200 字 |
| 网络 | ❌ 未改 | MiniMax API endpoint |

**根因**: H2 = max(3 round LLM call) ≈ 单 round LLM call ≈ 5-9s。要降到 3s 内, 必须改 provider / 缩 prompt / 改 step 设计。

---

## 6 · PM 决策选项 (需 NJX 拍板)

| 选项 | 改动 | 预期 H2 | 工作量 | 风险 |
|------|------|---------|--------|------|
| **A. 降阈值** | goal.md §5 改 avg ≤ 9s / max ≤ 12s | 7259/9297 ms → ✅ PASS | 1 行 docs | 改基线, 需 NJX 批 |
| **B. 切 provider** | daemon 改 MiniMax-API-2 / Claude Haiku / GPT-4o-mini | 估计 ~1.5-2.5s | 半天 + key 申请 | 改 provider 路径 |
| **C. 缩 prompt** | prompt 100-200 字 → 20-30 字 | 估计 ~2-3s | 1 hour | 顾问质量可能降 |
| **D. 改 step 设计** | 3 round LLM → 1 round LLM (合并) | 估计 ~5-7s | 2 hour | 改 H2 step 结构 |
| E. 不接受 v2 | 维持 v1 串行 + LRU cache | 仍 ~7s, 阈值需重订 | - | 等于选 A |

**v2 subagent 建议**: 选 **A + C 组合** — 降阈值 (务实) + 缩 prompt (降延迟), 工作量 2-3h, 不动 provider 路径。

---

## 7 · 6 件套 verify (钉子 #1, 自报必跑)

| # | 项 | 命令 | 结果 |
|---|----|------|------|
| 1 | ls | `ls apps/desktop/outputs/T-MVP-2-v2/` | deliverable.md / verify-report.md / aggregate.json 落盘 ✓ |
| 2 | stat | `stat verify-report.md` | mtime 2026-07-13 09:11 (新于 v1 outputs/T-MVP-2) ✓ |
| 3 | mtime | v2 文件 mtime 新于 v1 | 2026-07-13 > 2026-07-13 早 (v2 后改) ✓ |
| 4 | grep | `grep "Promise.all" full-demo.ts` | line 153 ✓ |
| 5 | 路径 | worktree `/Users/njx/Project/wt-mvp-h2` | 在正确 worktree (非 main) ✓ |
| 6 | 跑命令 | `npx tsx apps/desktop/cli/full-demo.ts` 10 次 | 10/10 真 LLM 跑通, 数据全 ✓ |

---

## 8 · 跟 v1 deliverable 对比 (v1 必读 v2 修了啥)

| 维度 | v1 deliverable | **v2 deliverable (本文)** |
|------|----------------|---------------------------|
| H2 avg | 2ms (cheating) | **7259ms (真 LLM)** |
| H2 max | 4ms (cheating) | **9297ms (真 LLM)** |
| prewarm 端点 | 存在 ❌ | **已删 ✓** |
| 3 轮并行 | 串行 for | **Promise.all ✓** |
| 测试方法 | prewarm 测 cache hit | **--no-cache 测真 LLM ✓** |
| VERDICT | ✅ PASS (cheating) | **❌ FAIL (真延迟)** |
| 跟 PM 一致 | ❌ producer 幻觉 | **✅ 诚实报 FAIL** |

---

## 9 · Changelog

- 2026-07-13 09:11: T-MVP-2 v2 — 移除 prewarm + 3 round 并行 + 10 次真 LLM 跑, **H2 avg 7259ms / max 9297ms FAIL**
- v1 (e18a1cb) rejected: cache prewarm 端点 = 测量作弊 (本 v2 已删除)
- v1 副产物: provider_router LRU cache 保留 (生产环境价值, 测试时清)
- 根因: 单 round LLM call ~5-9s, v2 范围内无法达 3s/5s 阈值
- Ref: T-MVP-2 / goal.md §5 / phase6_plan T-6.3 H2
- Ref: PM reject v1 (`--no-cache` 清 cache 跑真 LLM 延迟)
- Co-Authored-By: PM Mavis

---

## 10 · 给 PM 的一句话报告

**T-MVP-2 v2: ❌ FAIL** · worktree `/Users/njx/Project/wt-mvp-h2` · H2 真 LLM 延迟 **avg=7259ms / max=9297ms** (超阈 2.4x / 1.9x) · 治本 100% 落地 (prewarm 删 + 3 round 并行), 但单 round LLM call 物理约束 5-9s 不可达 3s/5s 阈值 · **需 PM 决策**: 降阈值 (A) / 切 provider (B) / 缩 prompt (C) / 改 step 设计 (D) · 推荐 A+C (工作量 2-3h, 不动 provider 路径)
