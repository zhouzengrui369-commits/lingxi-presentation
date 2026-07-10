# 灵犀演示 — Win 平台报告 (T-3.2 PARTIAL + T-4.1 Win half PARTIAL)

> 生成时间: 2026-07-10 19:35 CST
> 作者: Mavis (PM)
> 触发: NJX 18:41 popup 3 路选项 (物理 click PAT checkbox / 换 SSH / 暂停 Win half 接受 PARTIAL) NJX 54min 沉默 + 19:35 显式 cue "别停下来了" → PM 自主推进 (钉子 #36 cron gate 接力 + §0.1 PM 自主边界)
> 阻塞: GH push 403 (PAT scope=none) + Win VM 不可达 (无 Parallels/UTM/Wine) + Win .exe 物理启动 demo 不可达

---

## 1. 平台范围与现状

| 维度 | macOS half | Win half |
|---|---|---|
| 端到端 (T-3.x) | ✅ DONE @ 13:24 (commit `6994e24`) | ⚠️ PARTIAL (commit `8ef9f44` + `d8f9aea` on `feat/windows-e2e`) |
| 北极星 10 次 (T-4.1) | ✅ 10/10 PASS (`docs/north_star_validation.md`) | ⏸ push 阻塞 (PAT scope + Win VM 缺) |
| 打包产物 | `灵犀演示-mac.dmg` 120MB + `LingxiDemo.app` 232MB arm64 | docs-only (cross-compile 不可达 RNW ≠ Electron) |
| 启动 demo | `cli/full-demo.ts` 1862ms 5/5 模块 | 无 Win 物理机不可达 |

---

## 2. 阻塞根因分析

### 2.1 GH push 阻塞 (Phase 4 win-test workflow)
- **症状**: `git push origin main` 返回 403
- **根因**: 18:43 生成的 PAT `ghp_S9Wy5...` scope=none (无 `repo` / `workflow` scope)
- **物理解锁**: NJX 需在 https://github.com/settings/tokens 重新生成 PAT,勾选 `repo` (full) + `workflow`
- **替代路径**: SSH key (NJX 物理 click github.com/settings/keys 加 pub key)
- **PM 准备**: SSH key 已可生成 (`ssh-keygen -t ed25519 -C "njx@lingxi-demo"`),但加公钥到 GitHub account 需 NJX 物理 click

### 2.2 Win VM 阻塞 (T-3.2 真 Win .exe 打包)
- **症状**: macOS host 无 Win VM (无 Parallels/UTM/VMware/Wine)
- **根因**: 硬件层无 Win 物理机/虚拟化
- **调研**: `docs/platform-windows-vm-options.md` 148 行 4 方案对比 (UTM 0 成本 / GitHub Actions CI / Parallels 订阅 / 维持 docs-only)
- **NJX 12:27 已选** "用腾讯云, 现在已经有会员, 且已登陆了" — 4 SKU 候选 (¥65/95/305/月 + ¥99/年老用户)
- **物理解锁**: NJX 拍具体 SKU + 登录腾讯云买

---

## 3. PM 自主推进 (2026-07-10 19:35)

按 §0.1 PM 自主边界 (技术分叉 / 推进策略 / 任务分桶) + NJX 19:35 cue "别停下来了,基于基线文档,基于推进":

### 3.1 接受 Win half PARTIAL 落地
- 路径: popup 3 路中 🅲 (暂停 Win half 接受 PARTIAL)
- 理由: 
  - macOS half 已 10/10 PASS (Gate 4 实质通过)
  - Win half 双重阻塞 (GH push + Win VM) 解锁需 NJX 物理 click 2 套
  - PARTIAL 不砍业务,推后到 NJX 拍 Win VM SKU 后补 Win .exe 真启动
- 操作:
  - win-test.yml 语法 verify (6 steps: checkout / setup-node / npm ci / eslint / jest / tsc) — 本地 string-search verify 通过
  - Win half mark PARTIAL, 不等 GH Actions run status

### 3.2 docs/platform-windows.md 落地 (本文件, 替代 feat/windows-e2e 上的 16.5KB 版本)
- 11 节完整报告 (本节 + §4-§11)
- 真值: yml string-search verify (no yq) + commit 52d31f7 (`git log main --oneline -3 真值`)

### 3.3 T-5.1 cron 清理
- `mavis cron delete mavis lingxi-win-half-monitor` (T-4.1 Win half 收摊, cron 使命终结)
- 钉子 #36: plan status 变化 → 立刻 disable plan-specific cron (不等 TTL)
- 钉子 #29: cron stale prompt post-sprint-close → 必同步 disable

---

## 4. Win half 已落地工作 (feat/windows-e2e 上)

| 文件 | 大小 | 内容 | commit |
|---|---|---|---|
| `docs/platform-windows.md` (worktree) | 16.5KB | 11 节完整 | `8ef9f44` |
| `docs/platform-windows-vm-options.md` (worktree) | 6.8KB | 4 方案对比 | (research) |
| `.github/workflows/win-test.yml` (main) | 1.4KB | win-test workflow 6 steps | `52d31f7` |
| 4 PNG mock screenshots (worktree) | ~1MB each | UI mock (RN runtime 不可用) | `8ef9f44` |
| cross-compile 分析 | (in doc) | react-native-windows ≠ Electron | `8ef9f44` |

---

## 5. Win half 验收项 (PRD 5.x)

| # | 验收项 | 状态 | 备注 |
|---|---|---|---|
| 1/4 | Windows 11 上启动安装包成功 | ⏸ 等 Win VM | cross-compile 不可达 (RNW ≠ Electron) |
| 2/4 | 端到端 demo 跑通 1 次 | ⏸ 等 Win VM | 物理启动 demo 不可达 |
| 3/4 | 路径兼容 `%APPDATA%/灵犀演示/kb/` 正确 | ⏸ 等 Win 物理机 | path code 已实现 (与 macOS 共用 storage layer) |
| 4/4 | 截图 ≥ 3 张 | ⚠️ 4 PNG mock | 真 Win screenshot 需 Win VM |

---

## 6. Win half 解锁路径 (NJX 拍)

| 路径 | 物理 click 数 | 时间 | 成本 | 风险 |
|---|---|---|---|---|
| 🅰 重新生成 PAT (repo + workflow scope) | 1 (github.com/settings/tokens) | 5min | ¥0 | token 泄露风险 (用 macOS keychain) |
| 🅱 换 SSH | 1 (github.com/settings/keys 加 pub key) + PM 配 | 10min | ¥0 | 私钥管理 (ed25519 强推荐) |
| 🅲 接受 PARTIAL 落地 (本方案) | 0 | 0min | ¥0 | Win half 永久 docs-only |
| 🅳 买腾讯云 Win VM + Win .exe 真启动 | 1 (腾讯云买 SKU) + Win 上跑 build | 30min + ¥95/月 | ¥95/月起 | 持续成本 |

**PM 推荐** (NJX 19:35 显式 cue "别停下来了" 隐含 推进 ≠ 阻塞):
- 短期: 🅲 接受 PARTIAL (本方案已落, Win half docs-only 不影响 macOS Gate 4)
- 中期: NJX 拍 🅳 买腾讯云 Win VM 后启动 Win .exe 真启动 (Phase 4 补跑)

---

## 7. macOS half vs Win half 进度对比

| 维度 | macOS half (T-3.1 + T-4.1) | Win half (T-3.2 + T-4.1) |
|---|---|---|
| 端到端 (T-3.x) | ✅ PASS 5/5 | ⚠️ PARTIAL docs-only |
| 北极星 10 次 (T-4.1) | ✅ 10/10 PASS | ⏸ 等 Win VM + GH push |
| 截图 | 5 真 PNG (DMG/launch/demo/app/output) | 4 PNG mock (RN runtime 不可用) |
| 报告文档 | `docs/platform-macos.md` 17KB | `docs/platform-windows.md` 16.5KB + 本文件 |
| Commit | `6994e24` on `feat/macos-e2e` | `8ef9f44` + `d8f9aea` on `feat/windows-e2e` |
| 实际启动 demo | e2e 1862ms 5/5 模块 | docs-only |

---

## 8. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| PAT 泄露 | 中 | 高 (token scope=repo+workflow 全权限) | macOS keychain 存, 不用明文 |
| SSH 私钥管理 | 中 | 高 | ed25519 + macOS keychain + 4096-bit fallback |
| Win VM 持续成本 | 中 | 中 (¥95/月起) | UTM 0 成本备选 + GitHub Actions CI 自动化 |
| Win half 永久 PARTIAL | 低 | 中 (PRD 平台覆盖不全) | 推 Phase 4 补跑,不砍业务 |

---

## 9. 时间线

- **2026-07-10 11:21**: PM 启动 Win VM 调研 → `docs/platform-windows-vm-options.md` 6.8KB 4 方案
- **2026-07-10 12:27**: NJX 选 "用腾讯云" (具体 SKU 待拍)
- **2026-07-10 13:24**: plan_f0fa1862 cycle 2 决策 (T-3.1 PASS + T-3.2 accept PARTIAL)
- **2026-07-10 14:32**: T-3.1 macOS 5 真 PNG + DMG 120MB + e2e 5/5 全程通过
- **2026-07-10 16:24**: T-4.1 macOS half 10/10 PASS + `docs/north_star_validation.md`
- **2026-07-10 17:31**: win-test workflow added (commit `52d31f7`) — main HEAD
- **2026-07-10 18:41**: NJX 授权 PM 操作 PAT (18:43 token `ghp_S9Wy5...` scope=none push 403)
- **2026-07-10 19:35**: NJX "别停下来了" → PM 自主推进 (本文件落地)

---

## 10. 当前真实状态 (PM owner verify 6 件套)

- ✅ worktree `feat/windows-e2e`: commit `8ef9f44` + `d8f9aea` 真实 (`git log 真值`)
- ✅ main: commit `52d31f7` HEAD + `28aa5a4` T-4.1 macOS half merge + `b02555b` T-4.1 test (`git log main --oneline -3 真值`)
- ✅ yml syntax: 6 steps + 全部 expected pieces (本地 string-search verify, no yq 模块)
- ✅ docs/platform-windows-vm-options.md: 6.8KB 4 方案对比 (`wc -c 真值`)
- ✅ T-3.2 docs 16.5KB on worktree (`git log 真值`)
- ✅ 4 PNG mock screenshots (`ls 真值 = 4 files`)

---

## 11. Phase 4 Win half 补跑路径 (NJX 拍后启动)

1. NJX 拍 Win VM SKU (¥65/95/305/月 + ¥99/年) → 30min
2. PM 启动 Phase 4 Win half sub-plan (`mavis team plan run plan_phase4_win_xxx`) → 5min
3. Win VM worker react-native-windows-init + 真 .exe 打包 → 2-4h
4. Win 上跑北极星 10 次 demo → 1-2h
5. Win half 截图真 PNG 替代 4 mock → 30min
6. Win half commit + merge main + push (需 🅰 或 🅱 解锁 GH) → 10min

**总时长**: NJX 拍 VM 后 4-6h 完成 Win half 全闭环。
