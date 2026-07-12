# Lint Fix Deliverable

## VERDICT: **PASS** ✅

**Win CI green** = Lint 0 source errors + Jest 41/41 suites + 237/237 tests + merge to main 触发 CI 自动 green. Wave 2 (NJX 13:09 拍板) 治本 naming.test.ts 残留 1 fail, 升级 PARTIAL_PASS → PASS.

---

## Final State

| 检查项 | 结果 |
|---|---|
| Lint (源) | **0 errors** (24 files +35/-96 死代码清理 + 1 真 bug fix) |
| Lint (CI, 排除 dist/build/node_modules) | **0 errors** (56 warnings, 全部 pre-existing) |
| Jest 源 | **41/41 suites / 237/237 tests PASS** |
| Jest CI (windows-latest, NODE_OPTIONS=--experimental-vm-modules) | **41/41 suites / 237/237 tests PASS** (final GREEN run) |
| tsc --noEmit | pre-existing errors unchanged (continue-on-error: true) |
| Win CI workflow | **conclusion=success** on run #29181936209, sha=66e1eaf |

CI 完整 step 结果:
```
success: Set up job
success: Checkout
success: Setup Node.js 22
success: Install dependencies (npm ci)
success: Install Python deps (python-pptx for template tests)
success: Install vite + react for renderer build (no-save, in apps/desktop to avoid dmg-license in electron-shell)
success: Build electron-shell renderer bundle (for naming.test.ts test_workspace_layout)
success: Lint (eslint)
success: Unit tests (jest)
success: Type check (tsc --noEmit)
```

Jest final tail (CI log, sha=66e1eaf):
```
Test Suites: 41 passed, 41 total
Tests:       237 passed, 237 total
Snapshots:   0 total
Time:        9.208 s
Ran all test suites.
```

---

## Files Touched (Wave 1 + Wave 2 全部 commits)

### Wave 1 (lint fix, 1c66726, 2026-07-12 06:30)

`fix(lint): 60 unused-vars/undef cleanup for win CI Gate 3`
**24 files changed, +35/-96** — 1 真 bug fix (main.js paths 越界) + 59 unused-vars 清理

### Wave 1.5 (CI infra fixes, 5 commits, 06:48-07:18)

| Commit | 作用 |
|---|---|
| `c60e527` fix(template): cross-platform Python path | pptx_extract.ts 默认 `/usr/bin/python3` → win32 用 `python` |
| `89b44c4` ci(win): install python-pptx | workflow 加 `pip install python-pptx` (Windows runner 有 Python 无 pptx) |
| `1862e3e` fix(extract_pptx): force UTF-8 stdout | Windows default cp1252 → reconfigure utf-8 (中文 PPTX 文本) |
| `fae03c2` ci(win): NODE_OPTIONS=--experimental-vm-modules | jest VM 支持 pptxgenjs / docx dynamic import |
| `e024557` ci(win): revert renderer build step (out of scope) | revert 20dd868 (后续 wave 2 重做) |

### Wave 2 (Win CI green, 4 commits, 13:14-13:55)

| Commit | 作用 |
|---|---|
| `0ea0db8` ci(win): build renderer via npm install --no-save | workflow 加 2 步 (vite install + vite build) — **第一版失败 (dmg-license 仍触发)** |
| `36a2675` ci(win): add --ignore-scripts to npm install | **第二版失败** (npm 检查 os metadata, 不只是 postinstall) |
| `e7f5bd2` ci(win): install vite in apps/desktop | **第三版失败** (build step rollup 缺 react-dom/client) |
| `2aa233e` ci(win): also install react + react-dom in apps/desktop | **第四版失败** (lint 扫到 dist/renderer.bundle.js 9 no-undef) |
| `66e1eaf` ci(win): add .eslintignore to exclude dist/ | **第五版 PASS** (conclusion=success, 41/41 + 237/237) |

**Wave 2 净 commit: 5 (0ea0db8 + 36a2675 + e7f5bd2 + 2aa233e + 66e1eaf)**

---

## Wave 2 Debug Trail (5 次 CI 失败 + 1 次成功)

| # | Commit | 失败点 | 根因 | 修法 |
|---|---|---|---|---|
| 1 | 0ea0db8 | npm install --no-save 在 electron-shell/ | `dmg-license@1.0.11` (darwin-only) 在 electron-shell/devDeps → EBADPLATFORM | 加 --ignore-scripts |
| 2 | 36a2675 | 同上 | --ignore-scripts 不解决 metadata os field 检查 | 改在 apps/desktop/ 装 vite (无 dmg-license) |
| 3 | e7f5bd2 | vite build 失败 | rollup 缺 `react-dom/client` (electron-shell/ 未装 react) | 加 react + react-dom 到 --no-save list |
| 4 | 2aa233e | lint 失败 9 errors | dist/renderer.bundle.js 浏览器 globals (performance/MSApp/reportError) | 加 .eslintignore 排除 dist/ |
| 5 | 66e1eaf | — | — | **ALL PASS** |

---

## Final Win CI Run

- **Run URL**: https://github.com/zhouzengrui369-commits/lingxi-presentation/actions/runs/29181936209
- **SHA**: 66e1eaf
- **Status**: completed, **conclusion=success**
- **Trigger**: workflow_dispatch (手动) + 后续 push to main 自动触发 (钉子 #14 第五件验证)
- **Mtime**: 13:59:41 UTC = 21:59:41 CST (jest 跑完) → 全绿 14:00 CST

---

## Pre-existing Tech Debt (out of scope, 不打回)

- `npx tsc --noEmit` step 失败 (pre-existing source tsc errors, workflow 已 `continue-on-error: true`) — 与本任务无关, source tsc errors 在 deliverable.md 早期版本已记录

---

## 5-Step Debug 经验 (跨项目可复用)

1. **npm install 在 dmg-license/dmg-license 这种 darwin-only devDep 下, --no-save / --ignore-scripts 都救不了** — 必须避开含该 dep 的目录
2. **vite build 缺 peer dep 时, 必须装 peer (react/react-dom)** — vite 自己不会装
3. **CI build 产物在 lint/jest 前生成, 一定加 .eslintignore** — 否则 browser globals 全部触发 no-undef
4. **workflow 步骤顺序 = 依赖顺序**: Python (extract_pptx.py) → vite build (dist/) → lint (排除 dist/) → jest (需要 dist/) — 顺序反了全错
5. **macOS dev 没问题 ≠ Windows CI 没问题** — dmg-license / cp1252 / dynamic-import 全部是 win32 专属坑
