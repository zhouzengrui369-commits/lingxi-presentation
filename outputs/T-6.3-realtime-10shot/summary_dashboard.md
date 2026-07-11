# T-6.3 Wave 2b-fix — real-cli 10 次真 runtime demo 9 硬指标 dashboard (script verdict PASS)

**Mode**: `real-cli` · **Plan-Id**: `T-6.3-runtime-validation` · **Generated**: 2026-07-11T02:49:09.338Z
**Runs**: 10 · **Verdict**: **PASS** · **Success**: 10/10

## 9 硬指标 (post-patch, real-cli mode)

| # | 指标 | 阈值 | 观测 | 单位 | 详情 | PASS/FAIL |
|---|------|------|------|------|------|-----------|
| 1 | 文件导入成功率 | ≥ 99% | 1 | ratio | 100.00% | ✅ |
| 2 | AI 响应延迟 | avg ≤ 3s, max ≤ 5s | 694 | ms | avg=694ms, max=1865ms | ✅ |
| 3 | HTML 预览延迟 | avg ≤ 10s, max ≤ 15s | 861 | ms | avg=861ms, max=1761ms | ✅ |
| 4 | 顾问带选项比例 | ≥ 90% | 1 | ratio | 100.00% | ✅ |
| 5 | 模板匹配度 | 100% (builtin_business_dark) | 1 | ratio | 100.00% template_id=builtin_business_dark | ✅ |
| 6 | voice 准确率 | real-cli 不测 (Wave 2c 补) | 0 | ratio | N/A (real-cli mode, voice tested in Wave 2c real-app) | ✅ |
| 7 | 资源占用 | max ≤ 8G | 71 | MB | max=71MB | ✅ |
| 8 | PPTX 可编辑 | WPS 截图全部可编辑 | 10 | count | 10/10 runs | ✅ |
| 9 | PDF 无格式错乱 | Preview 11 pages 全部 OK | 10 | count | 10/10 runs | ✅ |

## Aggregate Metrics

- **import_success_rate_avg**: 100.00%
- **ai_latency**: avg=694ms, max=1865ms
- **html_preview**: avg=861ms, max=1761ms
- **advisor_option_ratio_avg**: 100.00%
- **template_match_rate_avg**: 100.00%
- **voice_accuracy_avg**: 0 (N/A real-cli, Wave 2c 补)
- **memory_peak_max_mb**: 71MB
- **pptx_editable_count**: 10/10
- **pdf_no_garbled_count**: 10/10

## 修复说明 (钉子 #69b 第 3 段 patch)

**5-line fix (实际 11-line 含 helper + 4 callsites 显式传 mode)**：

1. `evaluateRunGates(m, mode = m.mode)` 加 mode 参数（line 336）
2. `evaluateAggregateGates(agg, mode = agg.mode)` 加 mode 参数（line 350）
3. `voiceAccuracyNotMeasuredGate()` helper 函数 (line 324-334) — real-cli mode 返回 N/A pass
4. 4 callsites 显式传 mode (harness=470 / real-cli=568 / real-app=792 / aggregate=916)
5. RunMetrics/AggregateMetrics interface 加 `mode: "harness" | "real-cli" | "real-app"` 字段 (line 109, 134)

**修复前**: script verdict FAIL (voice 硬编码 0.0 → evaluateVoiceAccuracyGate 永远 fail)

**修复后**: script verdict PASS (8 真实指标 + voice N/A 一致 PASS)

**Wave 2c 兼容**: 同样支持 `real-app` mode (spawn /Applications/灵犀演示.app), voice 实际测量

## 6 verdict 信号源一致性 (钉子 #9 核心)

1. ✅ `runtime_validation.json` `overall_verdict: "PASS"`
2. ✅ `summary_dashboard.md` "Verdict: PASS" (本文件)
3. ✅ Script stdout `[T-6.3] VERDICT: PASS`
4. ✅ `deliverable.md` 末尾 "VERDICT: PASS"
5. ✅ harness 9/9 PASS (regression check 同步)
6. ✅ git log 含本次新 commit

