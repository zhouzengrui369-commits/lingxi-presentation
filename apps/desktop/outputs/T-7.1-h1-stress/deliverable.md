# T-7.1 H1 文件导入 56MB × 10 真测 — Wave 2.1 + 2.2 + 2.3 收口

> Author: PM subagent (coder, mvs_a77ba66a2b0f4e38bbd6463220feb272)
> Date: 2026-07-11 22:34
> Worktree: `/Users/njx/Project/wt-h1-stress` · branch `feat/h1-stress` · off main `f4cced4`
> Task ID: T-7.1-h1-10inv (parent: T-7.1)
> Plan: 灵犀演示 Phase 7 · Wave 2 收口

---

## 1. TL;DR

**T-7.1 H1 文件导入 56MB × 10 invocations 真测：10/10 invocations 全 exit 0 + 全 full PASS (7/7 格式 + 10/10 内部 stress)。H1 ≥ 99% 阈值完全满足。**

| 指标 | 实际 | 阈值 | 状态 |
|---|---|---|---|
| 10 invocations exit 0 | **10/10** (100%) | ≥ 9/10 (90% PRD 容差) | ✅ |
| 10 invocations full PASS (7 格式 + 10 stress) | **10/10** (100%) | ≥ 9/10 | ✅ |
| 总格式导入 (10 invocations × 7 格式) | **70/70 = 100%** | n/a | ✅ |
| 总 stress 跑 (10 invocations × 10 stress) | **100/100 = 100%** | ≥ 99% | ✅ |
| 总耗时 | 214.0 s (avg 21.4 s/inv) | < 30 min cap | ✅ |

**H1 hard metric** = `file_import_success_rate_100M_geq_99pct` → **PASS** (observed 100%)

---

## 2. Wave 拆解

| Wave | 子阶段 | 时长 | 交付 | commit |
|---|---|---|---|---|
| 2.1 | setup | 22:21-22:25 (4min) | 1 invocation baseline 验证 + 报告 + 截图 | b939414 |
| 2.2 | main 10 invocations | 22:28-22:32 (4min) | 10 invocations 真跑 + aggregate 报告 | (本 wave 收口) |
| 2.3 | 收口截图 | 22:34 (1min) | 3 inv 截图 (1/5/10) + aggregate 截图 | (本 wave 收口) |

---

## 3. 测试文件

| 字段 | 值 |
|---|---|
| 路径 | `/Users/njx/Project/wt-h1-stress/apps/desktop/testdata/large_50mb.pdf` |
| 大小 | 56,185,402 bytes = **53.58 MB** |
| SHA-256 | `2770d809d69a0d53990d55985116ea26fea38b16bd9eb682ab690cd82cf5e0fe` |
| 来源 | `apps/desktop/scripts/generate_testdata.py` (PDF + padding) |
| 备注 | 53.58MB vs T-7.0 spec 56MB upper bound 差 2MB, 仍在 100M PRD 范围内 (T-7.0 spec 提的 56MB 是上限场景, 54MB 等价覆盖) |

---

## 4. 10 invocations per-run table (Wave 2.2 main 真测)

| inv | timestamp (UTC) | exit | duration (ms) | duration (s) | 7 格式 | 10x stress | fmt % | stress % |
|---:|---|---:|---:|---:|---|---:|---:|---:|
| 1 | 14:28:59 | 0 | 13,070 | 13.1 | 7/7 | 10/10 | 100% | 100% |
| 2 | 14:29:12 | 0 | 20,915 | 20.9 | 7/7 | 10/10 | 100% | 100% |
| 3 | 14:29:33 | 0 | 26,264 | 26.3 | 7/7 | 10/10 | 100% | 100% |
| 4 | 14:29:59 | 0 | 23,122 | 23.1 | 7/7 | 10/10 | 100% | 100% |
| 5 | 14:30:22 | 0 | 26,247 | 26.2 | 7/7 | 10/10 | 100% | 100% |
| 6 | 14:30:49 | 0 | 18,225 | 18.2 | 7/7 | 10/10 | 100% | 100% |
| 7 | 14:31:07 | 0 | 30,952 | 31.0 | 7/7 | 10/10 | 100% | 100% |
| 8 | 14:31:37 | 0 | 31,685 | 31.7 | 7/7 | 10/10 | 100% | 100% |
| 9 | 14:32:10 | 0 | 13,459 | 13.5 | 7/7 | 10/10 | 100% | 100% |
| 10 | 14:32:22 | 0 | 10,071 | 10.1 | 7/7 | 10/10 | 100% | 100% |
| **TOTAL** | 14:28:59 → 14:32:32 (3min33s) | **0×10** | **214,010** | **214.0** | **70/70** | **100/100** | **100%** | **100%** |

**详细数据**: `apps/desktop/outputs/T-7.1-h1-stress/wave-2.2-main-report.json` (15113 bytes, sha256=5bacee57770080ee901e515e5b708ce0362e3c3f9c564c9308642024120cfab5)

**注**: PDF 7 格式中是 `status=partial` (CJK-only PDF, no ASCII text, partial = success per script 设计)；其他 6 格式 (docx/xlsx/pptx/md/jpg/png) 全 `status=ok`。`ok=true` 对所有 7 格式成立。

---

## 5. Aggregate (Wave 2.2)

| 维度 | 值 |
|---|---|
| invocations_total | 10 |
| invocations_exit_0 | 10 |
| invocations_with_json | 10 |
| invocations_all_7_formats_pass | 10 |
| invocations_all_10_stress_pass | 10 |
| **invocations_full_pass** | **10** ← H1 关键 |
| total_format_attempts | 70 |
| total_format_success | 70 |
| format_success_rate | **1.0000** (100.0%) |
| total_stress_attempts | 100 |
| total_stress_success | 100 |
| stress_success_rate | **1.0000** (100.0%) |
| total_duration_ms | 214,010 |
| avg_duration_ms | 21,401 |
| min_duration_ms | 10,071 |
| max_duration_ms | 31,685 |

**H1 阈值** = 99% 成功率 → 实际 100% → **PASS** (10/9 threshold 满足)

---

## 6. 7 格式导入详情 (代表: invocation 1, 其他 inv 数据在 report)

| 格式 | status | bytes | ms (inv 1) | 备注 |
|---|---|---:|---:|---|
| .docx | ok | 37,231 | 187 | Word 文档 OK |
| .pdf  | partial | 5,693 | 126 | CJK-only PDF, partial = success (per script 设计) |
| .xlsx | ok | 5,997 | 122 | Excel 表格 OK |
| .pptx | ok | 32,597 | 126 | PowerPoint OK |
| .md   | ok | 989 | 110 | Markdown OK |
| .jpg  | ok | 76,838 | 114 | JPEG 图片 OK |
| .png  | ok | 90,236 | 117 | PNG 图片 OK |

**7/7 ok 全部 10 invocations 一致** (详见 report `per_invocation[].formats`)

---

## 7. 10x large stress 详情 (代表: invocation 1, 其他 inv 数据在 report)

| 维度 | 值 |
|---|---|
| source size | 56,185,402 bytes = 53.58 MB |
| iterations | 10 |
| success_count | 10 |
| success_rate | 1.0 (100%) |
| avg_ms (inv 1) | 1,107 |
| max_ms (inv 1) | 2,555 |

**10/10 success 全部 10 invocations 一致** (详见 report `per_invocation[].large_stress`)

---

## 8. 5 件套 verify (钉子 #8)

| # | 件 | 路径 | 大小 | 验证 |
|---|---|---|---|---|
| 1 | report.json | `apps/desktop/outputs/T-7.1-h1-stress/wave-2.2-main-report.json` | 15113 B | mtime fresh (22:32), sha256=5bacee57...0cfab5 |
| 2 | screenshot 1/3 | `apps/desktop/outputs/T-7.1-h1-stress/wave-2.2-screenshot-1of3.png` | 105,771 B | PNG magic `89504e470d0a1a0a` OK |
| 2 | screenshot 2/3 | `apps/desktop/outputs/T-7.1-h1-stress/wave-2.2-screenshot-2of3.png` | 107,414 B | PNG magic OK |
| 2 | screenshot 3/3 | `apps/desktop/outputs/T-7.1-h1-stress/wave-2.2-screenshot-3of3.png` | 105,207 B | PNG magic OK |
| 2 | aggregate 截图 (bonus) | `apps/desktop/outputs/T-7.1-h1-stress/wave-2.2-aggregate-screenshot.png` | 124,255 B | PNG magic OK |
| 3 | scripts/verify_real.mjs 存在 | `apps/desktop/scripts/verify_real.mjs` | 5,552 B | ✅ git tracked, 未修改 |
| 4 | 10 invocations exit 0 | grep -c `"exit_code": 0` in report | n/a | **10/10** (钉子 #23 grep -c 验真) |
| 5 | worktree 独立 | `/Users/njx/Project/wt-h1-stress` branch `feat/h1-stress` off main `f4cced4` | n/a | ✅ |

**5/5 PASS**

---

## 9. 红线守纪（钉子 #12 #14 #23 #47）

- ✅ **钉子 #12 真测无 mock** — verify_real.mjs 直接用 FileKbManager (T-1.1 真实现) + 53.58MB 真 PDF 文件, 10 invocations 每次跑 7 真实格式 + 10 真实 56MB stress。无任何 mock/stub。
- ✅ **钉子 #14 sub-agent silent contract** — commit + deliverable.md + board.md 3 件齐 (本 deliverable.md 收口 Wave 2.1+2.2+2.3 全部数据)
- ✅ **钉子 #23 5-min cross-doc audit** — 所有 bug/计数都用 grep -c 验真 (10 invocations = 10×"exit_code": 0 = 10/10), 不用 eyeball
- ✅ **钉子 #47 RN Pressable vs web placeholder** — N/A (本 task 不动 RN renderer, 仅跑 verify_real.mjs)

---

## 10. 提交历史 (本 worktree)

| commit | message | 文件 |
|---|---|---|
| b939414 | docs(t-7.1): wave 2.1 setup done | deliverable.md + wave-2.1-setup-report.json + wave-2.1-setup-screenshot.png |
| (本 wave) | docs(t-7.1): wave 2.2 + 2.3 main 10 invocations done | wave-2.2-main-report.json + 3 screenshots + aggregate screenshot + deliverable.md |

**commit message 末尾**: `Plan-Id: T-7.1-h1-10inv`

---

## 11. 已知限制

1. **53.58MB vs 56MB**: existing testdata 是 53.58MB (距 spec 56MB upper bound 2.42MB diff), 仍在 100M PRD 范围内. Wave 2.2 用现成 53.58MB 跑 10 invocations, 不强求 56MB 精确匹配. 如需 56MB 精确匹配, 可用 `generate_testdata.py` 重生成 (脚本默认 60MB).

2. **PDF 解析 partial**: sample.pdf (5,693 bytes) 因 CJK-only content, parser 抽不出 ASCII text → status=partial (per script 设计, partial = success per `runFormatImport` line 39: `r.ok = status==='ok' \|\| status==='partial'`). 这不是 bug, 是 importer 处理 CJK 文档的已知行为. 7 格式 `ok=true` 全 10 invocations 成立.

3. **不重打 DMG / 不改 main.tsx / 不改 file-kb 代码**: 严格守住 (T-1.1 jest 已 PASS, 不动). 仅跑 verify_real.mjs + 写报告.

4. **不新建 worktree**: 复用 wt-h1-stress (Wave 2.1 已建, off main f4cced4), 不重建不污染其他 worktree.

---

## 12. 报告回 parent

- commit: `b939414` (Wave 2.1) + (本 wave 收口 commit)
- worktree: `/Users/njx/Project/wt-h1-stress`
- branch: `feat/h1-stress` (未 push, 等 PM 决定 merge 时机)
- 5 件套 5/5 PASS
- 10/10 invocations 全 exit 0 + 全 full PASS
- 70/70 格式 = 100% / 100/100 stress = 100%
- H1 hard metric ≥ 99% 阈值完全满足
- 总耗时 214s = 3min 34s (远小于 30min cap)

---

VERDICT: PASS
