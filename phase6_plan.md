# 灵犀演示 — Phase 6 计划文档（phase6_plan.md）

> **范围**: 把 v0.1.0-beta 的 "jest 真 PASS 叙事" 修正为 "用户真能点出 5 大模块 + LLM Wiki 真持久化 + 9 硬指标真 app runtime 验证" 叙事。
> **触发**: PM 真机验证 2026-07-10 23:50 发现 6 个不达标项 (F-1 ~ F-6)，NJX 00:00 拍板 🅰 "kill zombie + Phase 6 立项"。
> **时间**: 2026-07-10 ~ Phase 6 Gate 完成 (按质量门卡推进，不卡死时间)。
> **质量门卡 (NJX 拍板"质量优先")**: 任一 Gate 不过不进入下一阶段。

---

## 1. 阶段总览

```
Phase 0: 立项 (4 文档 ready + owner 签字)            ✅ DONE 2026-07-09
Phase 1: 5 模块独立 demo (Gate 1)                    ✅ DONE 2026-07-10
Phase 2: 端到端集成 (Gate 2)                         ✅ DONE 2026-07-10
Phase 3: 双平台并行 (Gate 3)                         ⚠️ macOS done / Win PARTIAL
Phase 4: 北极星 10 次 demo 验证 (Gate 4)             ⚠️ macOS half done / Win half PARTIAL
Phase 5: 收尾归档 (cron 清理 + 文档 v2)              ✅ DONE 2026-07-10 19:43
                                                         ↑ PM 19:43 没跑 5-min cross-doc audit (钉子 #23)
                                                         → 23:50 验证发现 6 个不达标项
                                                         → 23:55 PM 验证报告 docs/PM_VERIFICATION_2026-07-10.md 落地
Phase 6: 真 app runtime 兑现 (Gate 5)                ← 当前阶段
   ├─ T-6.0 zombie cleanup + 5-min cross-doc audit (Phase 5 反向修)
   ├─ T-6.1 Electron BrowserWindow ↔ RN renderer 桥接 (F-2 治本)
   ├─ T-6.2 LLM Wiki KB 真持久化 (F-2 第二步)
   ├─ T-6.3 真 runtime 9 硬指标 10 次 demo 验证 (F-2 第三步)
   ├─ T-6.4 LingxiDemo 命名统一 (F-3)
   ├─ T-6.5 钉子 #38 入 memory + Phase 5 文档补段 (F-4)
   ├─ T-6.6 git rm --cached + .gitignore 改 LingxiDemo.app/ (F-5)
   ├─ T-6.7 docs/platform-macos.md 路径更新 (F-6)
   └─ T-6.8 重新打 DMG v0.2.0 + 装 /Applications/LingxiDemo.app (一致性)

   ↓
Phase 7: Beta 用户自服务 (W12 Gate per 12 周路线图, 等 Phase 6 完成后启动)
```

| Phase | 起止 | 任务数 | 并行度 | 出口标准 |
|---|---|---|---|---|
| Phase 6 | 2026-07-11 ~ Gate 5 | 9 task (1 清理 + 3 治本 + 5 配套) | T-6.1/T-6.2/T-6.6 串行; T-6.4/T-6.5/T-6.7 全并行 | LingxiDemo.app 真能点出 5 大模块 + KB 真持久化 + 9 硬指标 10 次 demo 真 PASS |
| Phase 7 | Gate 5 ~ | TBD (Beta 化) | TBD | 3-5 beta 用户自服务跑通 |

---

## 2. 任务清单

> **任务命名规范**: `T-<phase>.<seq> [P0/P1] 任务名`
> **优先级**: P0 = 必做 / P1 = 阶段内增强 / P2 = 未来
> **跟踪机制**: `session` (<30min) / `轮询` (30min-2h) / `cron` (≥2h)
> **依赖图参照**: §3

---

### Phase 6: 真 app runtime 兑现

#### T-6.0 [P0] zombie cleanup + 5-min cross-doc audit (PM 自主)

- **模块**: PM 收尾清理
- **依赖**: NJX 23:50 拍板 🅰 (已授权)
- **可并行**: 否 (Wave 1 已完成)
- **预计耗时**: 10min
- **分配给**: PM (Mavis)
- **产出物**:
  - 关闭 LingxiDemo 4 PID (3560/3574/3575/3597) → 已 DONE 00:01
  - mavis-trash 3 .Trash 残留 (1.2GB) → 已 DONE 00:02
  - mavis-trash 6 dmg-stage + wt-macos-stash + dmgbuild-venv (2.2GB) → 已 DONE 00:03
  - 启动新 灵犀演示 v0.1.0 (22:57 装, 22:58 跑) → 已 DONE 00:03
- **验收信号**:
  - [x] pgrep LingxiDemo = 0 个 (00:01 verify)
  - [x] .Trash + /private/tmp LingxiDemo 残留 0 个 (00:02 verify)
  - [x] 磁盘释放 4Gi (55→59 Gi available) (00:03 verify)
  - [x] 灵犀演示 PID 64315 + 3 helper 跑中 (00:03 verify)
- **失败回滚**: 灵犀演示 crash → `mavis-trash /Applications/灵犀演示.app` + 重打 (T-6.8)

---

#### T-6.1 [P0] Electron BrowserWindow ↔ RN renderer 桥接 (F-2 治本)

- **模块**: Electron shell + RN renderer
- **依赖**: T-6.0 (zombie clean)
- **可并行**: 否 (T-6.2 依赖 T-6.1)
- **预计耗时**: 2-3h
- **分配给**: sub-agent-electron-bridge
- **产出物**:
  - 代码改动: `apps/desktop/electron-shell/main.js` (line 50-100, `createWindow` 函数)
  - 代码改动: `apps/desktop/electron-shell/renderer.html` (替换为 RN renderer entry)
  - 代码改动: `apps/desktop/electron-shell/package.json` (加 RN renderer 构建脚本)
  - 测试: `apps/desktop/electron-shell/__tests__/main.test.ts` (5+ cases)
  - 截图: `screenshots/T-6.1/` (5 张真 PNG, BrowserWindow 渲染 5 路由)
- **验收信号**:
  - [ ] `cd apps/desktop/electron-shell && yarn build` 成功 (5 路由打包到 renderer)
  - [ ] `cd apps/desktop/electron-shell && yarn start` 启动, BrowserWindow 真显示 5 路由 (file_kb/advisor/template/preview/output)
  - [ ] cu MCP 真点击 5 路由 → 截图存档
  - [ ] 黑渲染区消失, 5 模块 UI 可见
- **失败回滚**: 5 路由 1 个不显示 → 修 main.js IPC handler, 修 renderer.html link

---

#### T-6.2 [P0] LLM Wiki KB 真持久化 (F-2 第二步)

- **模块**: file_kb 持久化
- **依赖**: T-6.1 (renderer 已接入 file_kb 路由)
- **可并行**: 否 (T-6.3 依赖 T-6.2)
- **预计耗时**: 2-3h
- **分配给**: sub-agent-kb-persistence
- **产出物**:
  - 代码改动: `apps/desktop/src/modules/file_kb/storage.ts` (改 user data dir 到 PRD 要求的 `~/Library/Application Support/灵犀演示/kb/`)
  - 代码改动: `apps/desktop/src/modules/file_kb/index.tsx` (startup 调 `ensureKbDir()`)
  - 测试: `apps/desktop/src/modules/file_kb/__tests__/storage-real-path.test.ts` (5+ cases)
  - 截图: `screenshots/T-6.2/` (5 张真 PNG, 5 文件导入后 KB 路径 5 wiki entry JSON)
- **验收信号**:
  - [ ] `cd apps/desktop && yarn test:file-kb:real-path` 通过
  - [ ] 5 文件导入后, `ls ~/Library/Application\ Support/灵犀演示/kb/` = 5 wiki JSON
  - [ ] cu MCP 真导入 5 文件 → 截图存档 (KB 路径 + 5 entry JSON)
- **失败回滚**: storage 写失败 → 修 path join, 修 error handler

---

#### T-6.3 [P0] 真 runtime 9 硬指标 10 次 demo 验证 (F-2 第三步)

- **模块**: 端到端 runtime 验证
- **依赖**: T-6.1 + T-6.2 (5 路由 + KB 都通)
- **可并行**: 否 (治本链最后一环)
- **预计耗时**: 3-4h
- **分配给**: sub-agent-runtime-validation
- **产出物**:
  - 代码改动: `apps/desktop/cli/real-runtime-validate.ts` (10 次 demo 跑真 app runtime)
  - 测试: `apps/desktop/cli/__tests__/real-runtime-validate.test.ts` (10 次 demo harness)
  - 报告: `docs/runtime_validation.md` (10 次真跑数据)
  - 截图: `screenshots/T-6.3-runtime/` (10 张真 PNG + summary_dashboard)
- **验收信号** (9 硬指标真 app runtime 验证):
  - [ ] 文件导入成功率 ≥ 99% (10 次 demo 各 5 文件 = 50 文件, ≤ 0 失败)
  - [ ] AI 响应延迟 ≤ 3s (10 次 avg ≤ 3s, max ≤ 5s)
  - [ ] HTML 预览延迟 ≤ 10s (10 次 avg ≤ 10s, max ≤ 15s)
  - [ ] 顾问带选项比例 ≥ 90% (10 次平均 ≥ 90%)
  - [ ] 模板匹配度 100% (10 次 builtin_business_dark 全过)
  - [ ] voice 准确率 ≥ 95% (10 次 mock 录音池, 真 Whisper 校)
  - [ ] 资源占用 ≤ 8G (10 次 max ≤ 8G, Activity Monitor 抓)
  - [ ] PPTX 可编辑 (WPS 真截图, 10 次)
  - [ ] PDF 无格式错乱 (Preview 11 pages, 10 次)
- **失败回滚**: 任一硬指标 FAIL → 修对应模块, 重跑 10 次

---

#### T-6.4 [P0] LingxiDemo 命名统一 (F-3)

- **模块**: Electron-builder 配置
- **依赖**: 无
- **可并行**: 是 (独立任务)
- **预计耗时**: 1h
- **分配给**: sub-agent-naming-unify
- **产出物**:
  - 代码改动: `apps/desktop/electron-shell/package.json` (productName + mac.extendInfo CFBundleDisplayName 一致)
  - 决策: NJX 拍板 "LingxiDemo" (英文 binary) 或 "灵犀演示" (中文 binary) 二选一
- **验收信号**:
  - [ ] `cd apps/desktop/electron-shell && yarn build:mac` 成功, binary name 统一
  - [ ] `cp -R dist/mac/LingxiDemo.app /Applications/` (或 灵犀演示.app, NJX 拍)
  - [ ] `lsappinfo list | grep -i lingxi` 只 1 个 bundle 注册
- **失败回滚**: 同 bundle id 冲突 → 改 bundle id suffix (e.g. `com.openclaw.lingxi.v2`)

---

#### T-6.5 [P0] 钉子 #38 入 memory + Phase 5 文档补段 (F-4)

- **模块**: PM discipline
- **依赖**: 无
- **可并行**: 是
- **预计耗时**: 30min
- **分配给**: PM (Mavis)
- **产出物**:
  - 钉子 #38: 写入 `~/.mavis/agents/mavis/memory/mavis-runtime-discipline.md` 段
  - 文档改动: `docs/RELEASE_NOTES.md` §4.1 加 "⚠️ LingxiDemo.app 23:50 已不在 /Applications"
  - 文档改动: `delivery.md §3 T-3.1` 段补 "现状 23:50 FAIL — 见 docs/PM_VERIFICATION_2026-07-10.md"
  - 文档改动: `delivery.md Changelog` 增 "2026-07-10 23:55 PM 真机验证 + 6 不达标项"
- **验收信号**:
  - [ ] `grep "钉子 #38" ~/.mavis/agents/mavis/memory/mavis-runtime-discipline.md` 命中
  - [ ] `git diff docs/RELEASE_NOTES.md delivery.md` 有真改动
  - [ ] 5-min cross-doc audit (server port / primary path / app bundle / user data / git status) 全过
- **失败回滚**: 文档改错 → git revert

---

#### T-6.6 [P0] git rm --cached + .gitignore 改 LingxiDemo.app/ (F-5)

- **模块**: 仓库卫生
- **依赖**: 无
- **可并行**: 是
- **预计耗时**: 30min
- **分配给**: PM (Mavis)
- **产出物**:
  - 改动: `.gitignore` 加 `apps/desktop/electron-shell/LingxiDemo.app/` (替代 `*.app/`)
  - 命令: `git rm -r --cached apps/desktop/electron-shell/LingxiDemo.app` 清理 index
  - commit: `chore(git): rm LingxiDemo.app from index + ignore LingxiDemo.app/`
- **验收信号**:
  - [ ] `git ls-files apps/desktop/electron-shell/LingxiDemo.app/ | wc -l = 0`
  - [ ] `git status --short | wc -l < 10` (228 个 D 痕迹全清)
  - [ ] commit 落地
- **失败回滚**: commit 错 → `git reset HEAD~1`

---

#### T-6.7 [P0] docs/platform-macos.md 路径更新 (F-6)

- **模块**: 文档同步
- **依赖**: 无
- **可并行**: 是
- **预计耗时**: 15min
- **分配给**: PM (Mavis)
- **产出物**:
  - 改动: `docs/platform-macos.md` §2.1 路径 `apps/desktop/dist/灵犀演示-mac.dmg` → `apps/desktop/electron-shell/dist/灵犀演示-mac.dmg`
  - commit: `docs: update platform-macos.md §2.1 dist path to electron-shell/dist/`
- **验收信号**:
  - [ ] `grep "electron-shell/dist" docs/platform-macos.md` 命中
  - [ ] commit 落地
- **失败回滚**: 文档改错 → git revert

---

#### T-6.8 [P0] 重新打 DMG v0.2.0 + 装 /Applications/LingxiDemo.app (一致性)

- **模块**: 打包 + 安装
- **依赖**: T-6.1 + T-6.2 + T-6.4 (5 路由 + KB + 命名都通)
- **可并行**: 否 (T-6.3 验证前必须装)
- **预计耗时**: 1-2h
- **分配给**: sub-agent-repackage
- **产出物**:
  - 产物: `apps/desktop/electron-shell/dist/灵犀演示-0.2.0-arm64.dmg` (新版本, 188-200MB)
  - 产物: `apps/desktop/electron-shell/dist/灵犀演示-0.2.0.dmg` (universal)
  - 安装: `cp -R dist/mac/LingxiDemo.app /Applications/` (或 灵犀演示.app, T-6.4 决策)
- **验收信号**:
  - [ ] `ls apps/desktop/electron-shell/dist/*.dmg` ≥ 2 个
  - [ ] `ls /Applications/LingxiDemo.app` 真存在
  - [ ] `open /Applications/LingxiDemo.app` 启动, pgrep 出 4 PID
  - [ ] cu MCP 真点击 5 路由 → 截图存档
- **失败回滚**: 启动 crash → 回滚到 v0.1.0 (22:57 装的 灵犀演示.app)

---

## 3. 依赖图

```
NJX 23:50 拍板 🅰 (kill zombie + Phase 6 立项)
   ↓
T-6.0 zombie cleanup + 5-min cross-doc audit (Wave 1)     [PM 自主, 00:01-00:03 DONE]
   ↓
   ├─ T-6.1 Electron ↔ RN renderer 桥接 (Wave 3 sub-plan 1)  [sub-agent, 2-3h]
   │     ↓
   │  T-6.2 LLM Wiki KB 真持久化 (Wave 4 sub-plan 2)        [sub-agent, 2-3h]
   │     ↓
   │  T-6.3 真 runtime 9 硬指标 10 次 demo (Wave 5 sub-plan 3) [sub-agent, 3-4h]
   │
   ├─ T-6.4 LingxiDemo 命名统一 (Wave 3 平行 sub-plan)      [sub-agent, 1h]  ← 需 NJX 拍 binary 名字
   │     ↓
   │  T-6.8 重新打 DMG v0.2.0 + 装 (Wave 6 收尾 sub-plan)   [sub-agent, 1-2h]
   │
   ├─ T-6.5 钉子 #38 + 文档补段 (Wave 3 平行, PM 自主)     [PM, 30min]
   ├─ T-6.6 git rm --cached + .gitignore (Wave 3 平行)       [PM, 30min]
   └─ T-6.7 docs/platform-macos.md 路径更新 (Wave 3 平行)   [PM, 15min]

T-6.1/6.4/6.5/6.6/6.7 全并行启动
   ↓
T-6.2 依赖 T-6.1
   ↓
T-6.3 依赖 T-6.2
   ↓
T-6.8 依赖 T-6.1 + T-6.2 + T-6.4
   ↓
PM 验收 (Gate 5)
   ↓
Phase 7: Beta 化 (12 周路线图 W12 Gate, TBD)
```

**最大并行度**: Wave 3 有 5 个并行任务 (T-6.1 / T-6.4 / T-6.5 / T-6.6 / T-6.7), 后续 4 个串行。

---

## 4. 并行策略

### 4.1 必须并行的任务
- T-6.1 (Electron 桥接) + T-6.4 (命名统一) + T-6.5 (PM 文档) + T-6.6 (git 卫生) + T-6.7 (docs 更新)
- 5 个任务不同模块, 不共享临时状态, 跨 sub-agent 隔离 worktree

### 4.2 必须串行的任务
- T-6.2 (KB 持久化) 依赖 T-6.1 (renderer 已接入 file_kb 路由)
- T-6.3 (runtime 验证) 依赖 T-6.2 (KB 路径稳定)
- T-6.8 (重打 DMG) 依赖 T-6.1 + T-6.2 + T-6.4 (5 路由 + KB + 命名都通)

### 4.3 Sub-agent 隔离
- 每个 sub-agent 在独立 git worktree 工作 (`/Users/njx/Project/wt-phase6-t61-bridge` 等)
- 合并前 PM 跑 smoke test (5 路由 + 1 KB + 1 runtime demo)
- 1 sub-agent 失败不影响其他 (worktree 隔离)

---

## 5. 风险登记

| # | 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|---|
| R-6.1 | Electron BrowserWindow ↔ RN renderer 桥接技术障碍 (create-react-app / vite 构建 + Electron IPC) | 中 | 高 | sub-agent 30min cap 内先做 proof-of-concept (renderer.html 静态加载 RN bundle), 再做完整桥接 |
| R-6.2 | LLM Wiki KB 路径从 lingxi-demo-electron 改到 灵犀演示 后, 老数据迁移问题 | 中 | 中 | PM 跑 `mv ~/Library/Application\ Support/lingxi-demo-electron/kb ~/Library/Application\ Support/灵犀演示/kb` (如果有老数据) |
| R-6.3 | T-6.3 runtime 9 硬指标任一 FAIL (e.g. PDF CJK 方块) | 中 | 中 | T-1.5 已知 1/9 ⚠️ PDF CJK, T-6.3 跑前用 weasyprint 替换 pdfkit (Phase 3 macOS Gate 延后项) |
| R-6.4 | T-6.4 binary 命名 NJX 拍 LingxiDemo vs 灵犀演示 → 后续 docs/截图全要跟 | 中 | 低 | PM 拍后全局 grep 替换, 一次性 commit |
| R-6.5 | T-6.6 git rm -r --cached 误删真 tracked 文件 | 低 | 高 | PM 跑前 `git ls-files apps/desktop/electron-shell/ | wc -l` 备份验证, 错了 `git reset` |
| R-6.6 | T-6.8 重打 DMG electron-builder 25.1.8 asar bug 重现 (钉子 #37 类似) | 中 | 中 | sub-agent 走 electron-builder 自动 provision Wine 路径 (macOS host 不需要 wine), 备好手工 cp Electron.app 兜底 |

---

## 6. 持续跟踪规则

| 任务类型 | 跟踪机制 |
|---|---|
| T-6.0 (PM 自主, 已完成) | session 内 |
| T-6.1 (2-3h) | mavis team plan engine 调度, cycle=1 max_concurrency=1 串行, 失败 auto-pause |
| T-6.2 (2-3h) | 同 T-6.1 串行 (依赖) |
| T-6.3 (3-4h) | 同 T-6.1 串行 (依赖) |
| T-6.4 (1h) | mavis team plan engine, 可与 T-6.1/6.5/6.6/6.7 并行 |
| T-6.5 (30min) | session 内 PM 自主 |
| T-6.6 (30min) | session 内 PM 自主 |
| T-6.7 (15min) | session 内 PM 自主 |
| T-6.8 (1-2h) | mavis team plan engine 串行 (依赖 T-6.1+6.2+6.4) |

**监控 cron**: Phase 6 启动时建 `phase6-monitor-30m` (30min tick, 扫 9 task 状态)
**心跳 cron**: 保留 `mavis-njx-heartbeat-12h` (全局)

---

## 7. 验收门卡 (Phase 6 Gate 5)

| 出口项 | 阈值 | 验证方法 |
|---|---|---|
| T-6.0 zombie cleanup | 0 个 LingxiDemo 残留 (除 .Trash) | pgrep + find 全局 verify |
| T-6.1 Electron ↔ RN 桥接 | 5 路由真在 BrowserWindow 渲染 | cu MCP 真点击 5 路由 + 截图 |
| T-6.2 KB 真持久化 | 5 文件导入 → 5 wiki entry JSON 写到 PRD 路径 | `ls ~/Library/Application\ Support/灵犀演示/kb/` |
| T-6.3 runtime 9 硬指标 | 9/9 ✅ (PDF CJK 用 weasyprint 修) | 10 次真 app runtime demo |
| T-6.4 命名统一 | lsappinfo 1 个 bundle, binary 1 个 name | lsappinfo + file |
| T-6.5 钉子 #38 | 写入 mavis-runtime-discipline.md | grep verify |
| T-6.6 git 卫生 | git ls-files LingxiDemo.app = 0 | git verify |
| T-6.7 docs 更新 | platform-macos.md §2.1 路径改 | grep verify |
| T-6.8 重打 + 装 | DMG v0.2.0 + LingxiDemo.app 装 /Applications | ls + open + pgrep |

**Gate 5 准备度**: 9/9 task done + 真 app runtime 9 硬指标全过 = Phase 6 ✅
**任一 FAIL = 不进 Phase 7**

---

## 8. 时间线

| 任务 | 起 | 预计止 | 依赖 |
|---|---|---|---|
| T-6.0 zombie cleanup | 2026-07-10 23:55 | 2026-07-11 00:05 | 已完成 |
| T-6.1/6.4/6.5/6.6/6.7 并行启动 | 2026-07-11 00:05 | 2026-07-11 04:00 (4h 并行 cap) | T-6.0 |
| T-6.2 串行 | 2026-07-11 04:00 | 2026-07-11 07:00 (3h) | T-6.1 |
| T-6.3 串行 | 2026-07-11 07:00 | 2026-07-11 11:00 (4h) | T-6.2 |
| T-6.8 串行 | 2026-07-11 11:00 | 2026-07-11 13:00 (2h) | T-6.1+6.2+6.4 |
| PM Gate 5 验收 | 2026-07-11 13:00 | TBD | T-6.8 |

**总预计**: 2026-07-11 00:05 启动, 13:00 Gate 5 验收 = **13h** (不卡死时间, 按质量)

---

## 9. Changelog

### 2026-07-11 00:05 — Phase 6 立项
- Author: PM (Mavis)
- Confirmed by: NJX 23:50 cue + 00:00 拍板 🅰 "kill zombie + Phase 6 立项"
- 内容: 9 task (1 cleanup + 3 治本 + 5 配套) + 依赖图 + 风险表 + 验收门卡
- 教训: 钉子 #38 待 T-6.5 写入 mavis-runtime-discipline.md
- 下一步: Wave 3 开 T-6.1/6.4/6.5/6.6/6.7 并行 sub-plan
