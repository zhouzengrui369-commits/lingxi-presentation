# T-MVP-2 v2 — H2 AI 响应延迟 真 LLM 10 次 verify 报告

> **基线项**: T-MVP-2 v2 / goal.md §5 辅助指标 (H2 ≤ 3s avg / ≤ 5s max) / phase6_plan T-6.3 H2
> **生成时间**: 2026-07-13 09:11
> **worktree**: `/Users/njx/Project/wt-mvp-h2` (branch `feat/mvp-h2`, base `e18a1cb`)
> **测试方法**: 10 次 full-demo, 每次 **--no-cache 清空 cache 跑真 LLM** (不 prewarm, 不测 cache 命中延迟)
> **daemon**: 127.0.0.1:64165 (fresh process, 测前 /v1/cache/clear)

---

## 0 · VERDICT

**❌ FAIL** — H2 真 LLM 延迟 avg=**7259ms** / max=**9297ms**, 阈值 avg ≤ 3000ms / max ≤ 5000ms, **超阈 2.4x / 1.9x**

---

## 1 · 实测数据 (10 runs, 真 LLM 延迟)

| Run | advisor step.ms | per_round LLM call (ms) | provider | cache |
|-----|-----------------|--------------------------|----------|-------|
| 01  | 5258            | [5244, 4861, 4810]       | api      | miss (--no-cache) |
| 02  | 8246            | [6245, 8221, 5452]       | api      | miss |
| 03  | 8469            | [5719, 8436, 4004]       | api      | miss |
| 04  | 7480            | [6511, 7453, 5793]       | api      | miss |
| 05  | **9297**        | [9283, 7266, 7182]       | api      | miss |
| 06  | 6668            | [4018, 3174, 6627]       | api      | miss |
| 07  | 5306            | [2561, 5269, 4502]       | api      | miss |
| 08  | 8261            | [5985, 5217, 8222]       | api      | miss |
| 09  | 5788            | [3066, 5413, 5703]       | api      | miss |
| 10  | 7816            | [7805, 3797, 6565]       | api      | miss |
| **avg** | **7259ms** | 单 round avg ≈ 5500ms | - | - |
| **max** | **9297ms** | 单 round max ≈ 9283ms | - | - |
| **min** | 5258ms | 单 round min ≈ 2561ms | - | - |

---

## 2 · 对比基线 / 阈值

| 指标 | v1 (cache 命中) | v1 (真 LLM, audit) | **v2 (真 LLM, 并行 3 round)** | 阈值 |
|------|-----------------|---------------------|-------------------------------|------|
| H2 avg | 2ms (cheating) | 7164ms (full 10 runs) | **7259ms** | ≤ 3000ms ❌ |
| H2 max | 4ms (cheating) | 20101ms (audit 单 run) | **9297ms** | ≤ 5000ms ❌ |
| H2 min | 1ms | - | 5258ms | - |

**关键观察**:
- v1 cache 命中 2ms/4ms = **测量作弊** (PM reject, 已纠)
- v1 audit 真 LLM 7164ms avg = **真实基线**
- v2 并行改造后 **7259ms avg**, **降 7164 → 7259 (-1.3%)**, 几乎没降
  - 根因: 并行让 sum(3 round) → max(3 round), 但单 round LLM call 仍 ~5-7s
  - v2 **治本执行成功** (3 round 真并行), 但**单 round LLM 延迟没变**

---

## 3 · 测试方法 (跟 v1 对比)

| 步骤 | v1 (cheating) | **v2 (clean)** |
|------|----------------|-----------------|
| Cache 处理 | `prewarm` 端点强制填 cache | `--no-cache` 清空 cache 跑 |
| 测试场景 | 1 个 prompt, cache hit | 3 个不同 prompt, cache miss |
| LLM call 次数/run | 1 (cache hit) | 3 (真并发) |
| 测的是 | 内存 LRU 查找延迟 (~0.5ms) | 真实 LLM API round-trip (~5-8s) |
| 数据真实性 | **❌ 作弊** | **✅ 真 LLM 延迟** |

---

## 4 · 改法落地证据 (v2 commit)

### 4.1 移除 /v1/cache/prewarm 端点

```bash
$ grep -n "prewarm\|CachePrewarm" backend/daemon/server.py
13:T-MVP-2 H2 治本 (v2): 不再用 prewarm 测 cache 命中延迟, 改在 full-demo.ts
# ↑ 只剩 1 行注释说明为什么不用 prewarm, 端点完全移除
```

### 4.2 full-demo.ts 3 轮串行 → 并行 (Promise.all)

```typescript
// apps/desktop/cli/full-demo.ts:128-180
// 串行 for 循环:  sum(t1, t2, t3) ≈ 3 * 5s = 15s
// 并行 Promise.all: max(t1, t2, t3) ≈ 5s (单 round 时间)
const chatResults = await Promise.all(
  roundPayloads.map((p) =>
    fetch(`${daemonBaseUrl()}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: p.prompt }),
    }).then(...)
  ),
);
```

### 4.3 保留 provider_router LRU cache (e18a1cb)

LRU cache 仍存在 + 有效 (provider_router.py), 只是测试时**主动清空**测真延迟。
工程价值: 生产环境避免重复 LLM call 浪费钱。

---

## 5 · 失败根因分析 (v2 范围内无法解决)

| 因素 | 状态 | 说明 |
|------|------|------|
| 并行改造 | ✅ 成功 | sum → max, 已落地 |
| prewarm 移除 | ✅ 成功 | 测真 LLM 延迟, 端点已删 |
| 单 round LLM call 延迟 | ❌ **超阈** | 5-9s, daemon 端 MiniMax Code API 物理约束 |
| provider 选择 | 未改 | 默认 cli primary → api fallback, 实测走 api |
| prompt 长度 | 未改 | 100-200 字 prompt |
| 网络 | 未改 | 真实 MiniMax API endpoint |

**v2 治本执行 100% 落地, 但 H2 阈值 3s/5s 在当前 LLM provider 物理约束下不可达**。

---

## 6 · PM 决策选项 (v2 改完, 阈值需调整或 provider 需切换)

| 选项 | 改动 | 预期 H2 | 工作量 | 风险 |
|------|------|---------|--------|------|
| A. 降阈值 | goal.md §5 改 avg ≤ 9s / max ≤ 12s | 7259/9297 ms → ✅ PASS | 1 行 docs | 改基线, 需 NJX 批 |
| B. 切 provider | daemon 改 MiniMax-API-2 / Claude Haiku / GPT-4o-mini | 估计 ~1.5-2.5s | 半天 + key 申请 | 改 provider 路径 |
| C. 缩 prompt | prompt 100-200 字 → 20-30 字 | 估计 ~2-3s | 1 hour | 顾问质量可能降 |
| D. 改 step 设计 | 3 round LLM → 1 round LLM (合并) | 估计 ~5-7s | 2 hour | 改 H2 step 结构 |
| E. 不接受 v2 | 维持 v1 串行 + LRU cache | 仍 ~7s, 阈值需重订 | - | 等于选 A |

**v2 subagent 建议**: 选 **A (降阈值) + C (缩 prompt) 组合**, 工作量 2-3h, 不改 provider 路径。

---

## 7 · 6 件套 verify (钉子 #1)

| # | 项 | 命令 | 结果 |
|---|----|------|------|
| 1 | ls | `ls apps/desktop/outputs/T-MVP-2-v2/` | deliverable.md / verify-report.md / aggregate.json 落盘 ✓ |
| 2 | stat | `stat verify-report.md` | mtime 2026-07-13 09:11 ✓ |
| 3 | mtime | 文件时间戳新于 v1 outputs/ | T-MVP-2-v2 比 T-MVP-2 新 ✓ |
| 4 | grep | `grep "Promise.all" full-demo.ts` | line 153 ✓ |
| 5 | 路径 | worktree `/Users/njx/Project/wt-mvp-h2` | 在正确 worktree ✓ |
| 6 | 跑命令 | `npx tsx apps/desktop/cli/full-demo.ts` 10 次 | 10/10 真 LLM 跑通, 数据全 ✓ |

---

## 8 · Changelog

- 2026-07-13 09:11: T-MVP-2 v2 — 移除 prewarm + 3 round 并行 + 10 次真 LLM 跑, **H2 avg 7259ms / max 9297ms FAIL**
- v1 (e18a1cb): provider_router LRU cache 30s TTL (保留)
- v1 (e18a1cb) rejected: cache prewarm 端点 = 测量作弊 (本 v2 已删除)
- 根因: 单 round LLM call ~5-9s, v2 范围内无法达 3s/5s 阈值
- Ref: PM reject v1 (`--no-cache` 清 cache 跑真 LLM 延迟)
- Ref: T-MVP-2 / goal.md §5 / phase6_plan T-6.3 H2
- Co-Authored-By: PM Mavis (派单 + ground truth verify)
