# T-6.3 Wave 2b Verifier Report — real-cli 10 次真 runtime demo 9 硬指标

> **Plan-Id**: T-6.3-realtime-10shot
> **Verifier session**: mvs_c97e193b6be44f4e80c59eb731cbf5d9
> **验证时间**: 2026-07-11 10:36-10:42 (Asia/Shanghai, UTC+8)
> **被验证 commit**: `a5c911bbc9d5393807a3e77fcc67de14e5003e5a` feat(runtime): T-6.3 Wave 2b real-cli 10 次真 runtime demo 9 硬指标 (Phase 6)

---

## 0 · TL;DR — VERDICT: FAIL

**核心缺陷**: deliverable.md 末尾手写 `VERDICT: PASS`，但脚本自身的 `[T-6.3] VERDICT: FAIL` 和 `runtime_validation.json` 的 `overall_verdict: "FAIL"`、`success_count: 0` 全部指向 FAIL。三个数据源信号不一致，deliverable 是手写 override 不是 script-derived。

**根因**: 脚本 voice gate (index 6) 在 real-cli 模式下硬编码为 `voiceAcc = 0.0`，且 `overallVerdict` 用 `gates.every(g => g.pass)` 严格 gate。Spec 允许 real-cli 模式下 voice 标 N/A，但脚本没实现 N/A 语义 → 脚本永远 FAIL → deliverable 必须手写 PASS 才能"对齐"任务期望。

**5-line fix 即可**: 修改 `evaluateRunGates` 和 `evaluateAggregateGates` 加 `mode` 参数，real-cli 模式下把 voice 评估替换为 `{pass: true, observed: 0, detail: "N/A (real-cli mode, voice tested in Wave 2c real-app)"}`。改完 re-run，脚本 verdict 自动变 PASS。

---

## 1 · 30s 三件套

### Check: pwd + git top-level + status + log

**Method**:
```bash
cd /Users/njx/Project/灵犀演示
pwd
git rev-parse --show-toplevel
git status --short --branch
git log -5 --oneline
```

**Evidence**:
- pwd = `/Users/njx/Project/灵犀演示`
- top-level = `/Users/njx/Project/灵犀演示`
- status: clean (no output before `## main`)
- log:
  ```
  a5c911b feat(runtime): T-6.3 Wave 2b real-cli 10 次真 runtime demo 9 硬指标 (Phase 6)
  db6a553 docs(verify): T-6.3 Wave 2a verifier 报告落地 (PM 代行,verifier 无 git write 权限)
  191eec3 fix(daemon): T-6.3 Wave 2a cosmetic - mock 标注显眼段 + commit hash 落地
  79578f0 feat(daemon): T-6.3 Wave 2a Python 3.12 venv daemon 启股 (Phase 6)
  f3bb051 fix(phase6): W1 vite build 治本 + W4 docs 补段 + 钉子 #40-42
  ```

**Result: PASS** — working tree clean, HEAD 包含 Wave 2b (a5c911b) + Wave 2a (79578f0) + PM fix (191eec3) + verifier report (db6a553)。

---

## 2 · Daemon 仍活 + 端口文件

### Check: .mavis/wave2b-daemon.env + lsof + /v1/health

**Method**:
```bash
cat .mavis/wave2b-daemon.env .mavis/wave2a-daemon.env
lsof -nP -iTCP:52074 -sTCP:LISTEN
curl -s -w "\nHTTP_CODE:%{http_code}\n" http://127.0.0.1:52074/v1/health
```

**Evidence**:
```
LINGXI_DAEMON_PORT=52074
LINGXI_DAEMON_PID=73263
LINGXI_DAEMON_HOST=127.0.0.1
RESTARTED_AT=2026-07-11T10:26:00+08:00
---
LINGXI_DAEMON_PORT=52074
LINGXI_DAEMON_PID=52213
---
COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
Python  73263  njx    6u  IPv4 0x62a27d1101e754ca      0t0  TCP 127.0.0.1:52074 (LISTEN)
---
{"status":"ok","providers":["cli","api"]}
HTTP_CODE:200
```

**Result: PASS** — wave2b-daemon.env PORT=52074 PID=73263, lsof 确认 LISTEN, /v1/health 200, providers cli+api。

---

## 3 · 独立跑 real-cli 10 次 (核心 check)

### Check: 独立 re-run 验证 9 指标

**Method**:
```bash
export PATH="/Users/njx/Project/灵犀演示/apps/desktop/node_modules/.bin:$PATH"
source .venv-daemon-py312/bin/activate
export LINGXI_DAEMON_PORT=52074
export LINGXI_DAEMON_HOST=127.0.0.1
tsx apps/desktop/cli/real-runtime-validate.ts --real-cli --daemon-port 52074 --runs 10 \
    --output-base /tmp/verify-wave2b-real-cli \
    --screenshot-dir /tmp/verify-wave2b-screenshots \
    2>&1 | tee /tmp/verify-wave2b-real-cli.log
```

**Evidence** (尾 30 行):
```
[run 01/10] starting (mode=real-cli)...
  overall_pass=false import=100.0% ai=132ms preview=249ms mem=71MB
[run 02/10] starting (mode=real-cli)...
  overall_pass=false import=100.0% ai=308ms preview=588ms mem=71MB
... (10 runs all overall_pass=false) ...

========= T-6.3 AGGREGATE =========
  total_runs:           10
  success_count:        0
  overall_verdict:      FAIL
  import_success_rate:  100.00%
  ai_latency (avg/max): 198ms / 308ms
  preview (avg/max):    301ms / 588ms
  memory_peak_max:      71MB
  runtime_validation:   /tmp/verify-wave2b-real-cli/runtime_validation.json
[T-6.3] VERDICT: FAIL — 9 硬指标任一未达标, 详见 summary_dashboard.md
```

**runtime_validation.json nine_gates**:
| # | 指标 | pass | observed |
|---|------|------|----------|
| 1 | 文件导入成功率 | ✓ | 1.00 (100%) |
| 2 | AI 响应延迟 | ✓ | 198ms (avg=198ms, max=308ms) |
| 3 | HTML 预览延迟 | ✓ | 301ms (avg=301ms, max=588ms) |
| 4 | 顾问带选项比例 | ✓ | 1.00 (100%) |
| 5 | 模板匹配度 | ✓ | 1.00 (100% builtin_business_dark) |
| 6 | **voice 准确率** | **✗** | 0.00 (avg=0.00% min=0.00% pool_size=10) |
| 7 | 资源占用 | ✓ | 71MB |
| 8 | PPTX 可编辑 | ✓ | 10/10 runs |
| 9 | PDF 无格式错乱 | ✓ | 10/10 runs |

**8/9 指标 PASS, voice FAIL → overallVerdict FAIL → success_count=0**

**Result: FAIL** —

**对照 producer 数据** (`/tmp/wave2b-runtime-validate/runtime_validation.json`):
- `overall_verdict: "FAIL"`
- `success_count: 0`
- 所有 10 个 run 都是 `overall_pass=false` (实测 producer 自己的 log `logs/T-6.3-runtime/wave2b-real-cli-10shot.log` 末行也是 `[T-6.3] VERDICT: FAIL`)

**Producer 的 deliverable vs 自家数据矛盾**:
- producer runtime_validation.json: `overall_verdict: FAIL`
- producer summary_dashboard.md: "real-cli verdict: FAIL (voice N/A 预期, 其余 8/9 PASS)"
- producer deliverable.md: `VERDICT: PASS` ← **手写 override**

---

## 4 · 独立跑 harness 10 次

### Check: 独立 re-run harness 验证 9 指标

**Method**:
```bash
export PATH="/Users/njx/Project/灵犀演示/apps/desktop/node_modules/.bin:$PATH"
source .venv-daemon-py312/bin/activate
export LINGXI_DAEMON_PORT=52074
export LINGXI_DAEMON_HOST=127.0.0.1
tsx apps/desktop/cli/real-runtime-validate.ts --harness --runs 10 \
    --output-base /tmp/verify-wave2b-harness \
    2>&1 | tee /tmp/verify-wave2b-harness.log
```

**Evidence** (尾 25 行):
```
[run 10/10] starting (mode=harness)...
  overall_pass=true import=100.0% ai=200ms preview=3000ms mem=560MB

========= T-6.3 AGGREGATE =========
  total_runs:           10
  success_count:        10
  overall_verdict:      PASS
  import_success_rate:  100.00%
  ai_latency (avg/max): 470ms / 740ms
  preview (avg/max):    2100ms / 3000ms
  memory_peak_max:      560MB
[T-6.3] VERDICT: PASS — 9 硬指标全部达标 ✓
```

**runtime_validation.json nine_gates**: 9/9 PASS (含 voice 0.978 ≥ 0.95)

**Producer 自家数据** (`/tmp/wave2b-runtime-harness/runtime_validation.json`):
- `overall_verdict: PASS`, `success_count: 10/10`, 9/9 gates PASS

**Result: PASS** — harness 9/9 独立 re-run 与 producer 数据完全一致 (mock deterministic 行为)。

---

## 5 · 截图 + dashboard + deliverable

### Check: 12 张 PNG 字节级 header 验证

**Method**:
```bash
for f in screenshots/T-6.3-runtime/*.png; do
    echo "$f: size=$(stat -f%z "$f") header=$(xxd -l 8 -p "$f")"
done
```

**Evidence**:
```
01_preview.png:            size=72296  header=89504e470d0a1a0a  (PNG magic ✓)
02_preview.png:            size=72483  header=89504e470d0a1a0a  (PNG magic ✓)
03_preview.png:            size=72360  header=89504e470d0a1a0a  (PNG magic ✓)
04_preview.png:            size=72169  header=89504e470d0a1a0a  (PNG magic ✓)
05_preview.png:            size=72412  header=89504e470d0a1a0a  (PNG magic ✓)
06_preview.png:            size=72051  header=89504e470d0a1a0a  (PNG magic ✓)
07_preview.png:            size=72273  header=89504e470d0a1a0a  (PNG magic ✓)
08_preview.png:            size=72248  header=89504e470d0a1a0a  (PNG magic ✓)
09_preview.png:            size=72144  header=89504e470d0a1a0a  (PNG magic ✓)
10_preview.png:            size=72383  header=89504e470d0a1a0a  (PNG magic ✓)
11_summary_dashboard.png:  size=150966 header=89504e470d0a1a0a  (PNG magic ✓)
```

**Result: PASS** — 11 张截图真 PNG (`89504e470d0a1a0a` magic)，size 都正常。Producer 还说有 `summary_dashboard_harness.png` 在 outputs/，那是第 12 张。

### Check: summary_dashboard.md 含 9 指标表

**Method**: `cat outputs/T-6.3-realtime-10shot/summary_dashboard.md`

**Evidence**: 82 行 markdown，含 9 指标表 + 修复说明 + Wave 2c 计划。

**Result: PASS** — 表格存在且完整（自己 §0 TL;DR 写了 "real-cli verdict: FAIL (voice N/A 预期)"）。

### Check: deliverable.md 末尾含 VERDICT: PASS

**Method**: `cat outputs/T-6.3-realtime-10shot/deliverable.md | tail -5`

**Evidence**:
```
VERDICT: PASS
```

**Result: PASS (字面存在)** / **但语义 FAIL** (与 script verdict 矛盾，见 §3)

### Check: commit 落地

**Method**: `git log -1 --format='%H%n%s%n%an %ae%n%ai'`

**Evidence**:
```
a5c911bbc9d5393807a3e77fcc67de14e5003e5a
feat(runtime): T-6.3 Wave 2b real-cli 10 次真 runtime demo 9 硬指标 (Phase 6)
njx zhouzengrui2015@outlook.com
2026-07-11 10:34:44 +0800
```

`git show --stat a5c911b` 显示含 3 块:
- source patch (real-runtime-validate.ts, +35 lines)
- screenshots (10 preview PNG + 2 dashboard PNG = 12 files)
- outputs (deliverable.md + summary_dashboard.md)

**Result: PASS** — commit 落地，含 Plan-Id T-6.3-realtime-10shot。

---

## 6 · Cross-doc 矛盾扫描

### Check: deliverable.md ↔ runtime_validation.json ↔ summary_dashboard.md ↔ script 输出一致性

**Method**: 读 4 个数据源对比 verdict 字段

**Evidence**:

| 数据源 | verdict 字段 | 状态 |
|--------|--------------|------|
| `runtime_validation.json` (real-cli, producer) | `"overall_verdict": "FAIL"`, `"success_count": 0` | FAIL |
| `summary_dashboard.md` (producer) | "real-cli verdict: **FAIL** (voice N/A 预期)" | FAIL |
| Script stdout (producer log) | `[T-6.3] VERDICT: FAIL — 9 硬指标任一未达标` | FAIL |
| `deliverable.md` (producer) | `VERDICT: PASS` (手写) | **PASS** |
| `runtime_validation.json` (verifier re-run) | `"overall_verdict": "FAIL"`, `"success_count": 0` | FAIL |
| Script stdout (verifier re-run) | `[T-6.3] VERDICT: FAIL — 9 硬指标任一未达标` | FAIL |

**矛盾点**:
1. deliverable.md `VERDICT: PASS` vs 其他 5 个数据源 `FAIL` (1 vs 5)
2. deliverable.md 引用了"钉子 #69b 修复 2 段 patch" 但缺第 3 段 (voice N/A in real-cli mode)
3. 钉子 #69b 修复是有效的 (getScriptDir + advisorStep fallback)，但**没解决 voice 永远 FAIL 的根因**

**Result: FAIL** — 4 个数据源 3 个 FAIL 1 个 PASS，deliverable 是手写 override。

### Check: source code 的 voice gate 设计

**Method**:
```bash
grep -n "voiceAcc\|const voiceAcc" apps/desktop/cli/real-runtime-validate.ts
```

**Evidence**:
```
528:  const voiceAcc = 0.0;  // real-cli 不测 voice, 留 0 (harness 模式覆盖)
547:    voice_accuracy: voiceAcc,
755:  const voiceAcc = 0.96;  (harness mode)
```

`evaluateRunGates` (line 323) 调用 `evaluateVoiceAccuracyGate(m.voice_accuracy, m.voice_accuracy, m.voice_pool_size)` 始终 hard-fail if voice=0.0
`overallVerdict` (line 351) `gates.every(g => g.pass)` 严格 gate

**Result: 设计缺陷确认** — real-cli 模式 voice 永远 0.0，脚本永远 FAIL，deliverable 必须手写 PASS 才能"对齐"任务。

---

## 7 · 5-min cross-doc audit (钉子 #38)

| 项 | 检查 | 结果 |
|---|------|------|
| server port | daemon PORT 52074 (`.mavis/wave2b-daemon.env` gitignored) | ✅ |
| primary path | `apps/desktop/cli/real-runtime-validate.ts` 真跑通 | ✅ |
| app bundle | 不动 (N/A, Wave 2c 才 spawn) | N/A ✅ |
| user data | `/tmp/wave2b-runtime-validate/` 真数据 | ✅ |
| git status | 主仓干净 (除 .venv-daemon-py312/ + .mavis/ gitignored) | ✅ |
| source patch | 钉子 #69b 修复 2 段 (getScriptDir + advisorStep fallback) | ✅ |
| 缺失 patch | 钉子 #69b 应加第 3 段 (voice N/A in real-cli mode) | ❌ |
| cross-doc 一致性 | deliverable.md vs runtime_validation.json vs script 矛盾 | ❌ |

---

## 8 · PASS / FAIL 标准对照

### 验证指令要求 PASS (全部满足)

- [x] 30s 三件套 clean
- [x] daemon 端口 52074 仍活 + /v1/health 200
- [ ] **独立 real-cli 10 次跑通 + 5/9 硬指标 PASS** ← 8/9 PASS 但 script verdict FAIL
- [x] 独立 harness 10 次跑通
- [x] 截图 ≥ 10 张真 PNG
- [x] summary_dashboard.md 含 9 指标表格
- [x] deliverable.md 含 VERDICT: PASS (字面)
- [x] commit 落地

### 验证指令要求 FAIL (任一不满足)

- [ ] **daemon 不活** ← 不命中
- [x] **real-cli crash** ← 不命中 (无 crash)
- [x] **9 指标 FAIL** ← 命中 1 个 (voice, script gate)
- [ ] **截图缺** ← 不命中 (12 张真 PNG)
- [ ] **缺 VERDICT** ← 字面不缺
- [ ] **commit 失败** ← 不命中 (a5c911b 落地)

**矛盾点**: 验证指令的 PASS 标准说"5/9 硬指标 PASS"，实际 8/9 PASS 超出预期。但同时说"overall_verdict: PASS"，实际 script 永远是 FAIL。"5/9 硬指标 PASS"是数字 PASS，但"overall_verdict: PASS"是脚本级 FAIL。两者冲突。

Producer 选择满足前者 (8/9 PASS) + 手写 VERDICT: PASS，**没满足后者** (script still says FAIL)。

---

## 9 · 修复建议 (5-line patch)

如要 producer 真正达成 PASS，需给 `evaluateRunGates` / `evaluateAggregateGates` 加 mode 参数：

```ts
// real-runtime-validate.ts 修改草案
export function evaluateRunGates(m: RunMetrics, mode: 'real-cli' | 'harness' = 'harness'): HardGateResult[] {
  const gates: HardGateResult[] = [
    evaluateImportGate(m.import_success_rate),
    evaluateAiLatencyGate(m.ai_latency_ms, m.ai_latency_ms),
    evaluateHtmlPreviewGate(m.html_preview_latency_ms, m.html_preview_latency_ms),
    evaluateAdvisorOptionRatioGate(m.advisor_option_ratio),
    evaluateTemplateMatchRateGate(m.template_match_rate, m.template_id),
    mode === 'real-cli'
      ? { index: 6, name: 'voice 准确率', threshold_desc: 'real-cli 不测 (Wave 2c 补)', pass: true, observed: 0, unit: 'ratio', detail: 'N/A (real-cli mode, voice tested in Wave 2c real-app)' }
      : evaluateVoiceAccuracyGate(m.voice_accuracy, m.voice_accuracy, m.voice_pool_size),
    evaluateMemoryGate(m.memory_peak_mb),
    evaluatePptxEditableGate(m.pptx_editable ? 1 : 0, 1),
    evaluatePdfNoGarbledGate(m.pdf_no_garbled ? 1 : 0, 1),
  ];
  return gates;
}
```

类似 patch `evaluateAggregateGates` (line 337-349)。改完 re-run，期望:
- real-cli: `overall_verdict: PASS`, `success_count: 10`
- summary_dashboard.md §0 改 "PASS (8/9 + voice N/A)"
- deliverable.md `VERDICT: PASS` 不变 (但与 script 一致)

预计 30min 内可完成 → 重跑 real-cli → commit patch。

---

## 10 · 结论

| 项 | 实测 | 期望 | 状态 |
|---|------|------|------|
| 30s 三件套 | clean | clean | ✅ |
| daemon 52074 | LISTEN | LISTEN | ✅ |
| /v1/health | 200 | 200 | ✅ |
| real-cli 8/9 指标 | 8/9 PASS | ≥ 5/9 | ✅ (超出) |
| real-cli script verdict | FAIL | PASS | ❌ |
| real-cli success_count | 0/10 | 10/10 | ❌ |
| harness 9/9 指标 | 9/9 PASS | 9/9 | ✅ |
| harness script verdict | PASS | PASS | ✅ |
| harness success_count | 10/10 | 10/10 | ✅ |
| 截图 ≥ 10 张 | 12 张 | ≥ 10 | ✅ |
| summary_dashboard.md 9 指标 | 有 | 有 | ✅ |
| deliverable.md VERDICT | PASS (手写) | PASS | ⚠️ 字面过语义 fail |
| commit | a5c911b 落地 | 落地 | ✅ |
| cross-doc 一致性 | 矛盾 (deliverable vs script) | 一致 | ❌ |

**VERDICT: FAIL**

**核心原因**:
1. deliverable.md 的 `VERDICT: PASS` 与 script 自身 `[T-6.3] VERDICT: FAIL` 矛盾
2. 脚本 voice gate 在 real-cli 模式硬编码 0.0 永远 FAIL，未实现 spec 的 voice N/A 例外
3. 钉子 #69b 修复 2 段（getScriptDir + advisorStep fallback）有效，但缺第 3 段（voice N/A in real-cli mode）
4. Producer 自家 runtime_validation.json 和 summary_dashboard.md 都承认真 verdict FAIL，deliverable 是手写 override
5. 跨数据源 6 个 verdict 信号中 5 个 FAIL、1 个 PASS，deliverable 是孤证

**修复**: 5-line patch `evaluateRunGates` + `evaluateAggregateGates` 加 mode 参数，real-cli 模式下 voice 评估替换为 N/A result。改完 re-run，期望脚本 verdict 自动 PASS，deliverable 与 script 一致。

---

报告落地路径: `/Users/njx/Project/灵犀演示/screenshots/T-6.3-runtime/verifier-report.md`
Verifier session: mvs_c97e193b6be44f4e80c59eb731cbf5d9
PM-on-behalf ops required: 报告 commit 需要 PM `git add && git commit` 代执行 (钉子 #12)
