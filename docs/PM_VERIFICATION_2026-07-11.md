# 灵犀演示 — PM 二次验收报告（2026-07-11 09:51 CST）

> **报告类型**: PM 独立 verify（NJX 09:48 cue "基于 4 分基线文档，验收灵犀演示项目，输出验收报告"）
> **报告人**: PM (Mavis)
> **验证方法**: 30s 三件套 + 真机 open app + AppleScript UI inspect + packaged app 内部 ls + cli full-demo 跑 + 4 文档 v2 审计
> **报告路径**: `/Users/njx/Project/灵犀演示/docs/PM_VERIFICATION_2026-07-11.md`
> **截图**: `screenshots/PM-FINAL-ACCEPT/{01_initial_desktop, 03_lingxi_active_blank, 04_after_text_evidence}.png` + 物证 `/tmp/lingxi_evidence.txt`

---

## 0. 一句话总评

**❌ 不通过 — 4 项硬指标未真兑现，10/10 北极星是 cli mock 跑通，不是 app runtime。**

| 维度 | 评级 | 一句话 |
|---|---|---|
| **4 文档 v2** | ✅ 通过 | goal/plan/rules/delivery/phase6_plan 共 2293 行，结构完整 |
| **5 大 P0 模块业务代码** | ✅ 通过 | T-1.1~1.5 jest 单元 9/9~74/74 PASS，merged main |
| **Phase 6 9 task merged main** | ✅ 通过 | 9/9 commit 落地，T-6.4 LingxiDemo→灵犀演示 命名统一真 |
| **/Applications/灵犀演示.app 装** | ✅ 通过 | 04:23 装，4 PID 跑，user-data-dir = `~/Library/Application Support/灵犀演示/` |
| **KB 真持久化路径** | ✅ 通过 | T-6.2 真修，files/ + entries/ + manifest.json 真落地 7+7 |
| **T-6.1 Electron↔RN 桥接** | ❌ **不通过** | vite build 从未跑，packaged app 缺 dist/renderer.bundle.js |
| **T-6.3 9 硬指标真 runtime** | ❌ **不通过** | daemon 未在跑，full-demo.ts 第一步 FATAL，AI 链路无真 LLM |
| **T-G4-macos 10/10 北极星** | ❌ **不通过** | 10 次 4 格式 size 100% 相同 = mock 假 data，不是 LLM 真生成 |

---

## 1. 4 文档 v2 状态

| 文档 | 行数 | 状态 | 一致性 |
|---|---|---|---|
| goal.md | 163 | ✅ | 5 决策 + 8 不做 + 4 Gate + 8 风险齐 |
| plan.md | 484 | ✅ | 17 task（Phase 0-5） |
| rules.md | 363 | ✅ | 9 节完整 + 灵犀专属 |
| delivery.md | 916 | ⚠️ | §2 table 停在 T-5.1，**缺 Phase 6 9 task 状态行**（文档 stale） |
| phase6_plan.md | 367 | ✅ | 9 task + 风险 + 验收门卡 |

**不一致**:
- ❌ **delivery.md §2 table 缺 Phase 6 9 task 状态行**（T-6.0~6.8 + T-G4-macos + T-G4-win）
- ❌ **docs/PHASE_6_FINAL_VERIFICATION.md** 写"VERDICT PASS 基线 4 Gate + 5 硬指标 + Phase 6 9 task 全过" — 跟本报告结论冲突（5 硬指标 4/9 mock 跑）

---

## 2. 4 Gate 验收状态

| Gate | 目标 | PM verify 结论 |
|---|---|---|
| **Gate 1**（5 模块独立 demo） | Phase 1 5 task 跑通 | ✅ 单元 jest PASS（业务代码真） |
| **Gate 2**（5 模块端到端） | 季度汇报场景 1 次走通 | ⚠️ T-2.2 PM 端到端 demo 截图存 8 张，**实际是 cli 脚本跑**（T-2.2 时期 daemon 不依赖，截图可能是 mock） |
| **Gate 3**（macOS + Win 双平台） | macOS + Win 各 1 次 | ⚠️ macOS 5/5 PASS（cli + 打包 OK）；Win PARTIAL（Wine 模拟，从未真 Win 跑） |
| **Gate 4**（10 次零失败） | 连续 10 次 demo | ❌ **不通过** — 10/10 PASS 是 cli 脚本 mock 跑通，preview_latency 90-212ms / advisor_latency 73-157ms 是 fakeFetch 50ms，4 格式 size 10 次完全相同（71.6KB/6.3KB/9.2KB/4.1KB）— **不是 LLM 真生成** |

---

## 3. 5 硬指标 (goal.md §3 性能门卡) — PM 真机 verify

| # | 硬指标 | 阈值 | PM 实测 | 评级 |
|---|---|---|---|---|
| 1 | 文件导入成功率 | ≥ 99% | cli 脚本 100% (50/50 mock) | ⚠️ 业务逻辑 PASS，真 LLM 抽取未跑 |
| 2 | AI 交互响应延迟 | ≤ 3s | mock 50ms fakeFetch（cli 跑） | ❌ **未测真 LLM**，daemon 未启动 |
| 3 | HTML 预览生成延迟 | ≤ 10s | mock 50ms fakeFetch | ❌ **未测真 LLM** |
| 4 | 资源占用 | ≤ 8G 内存 | max 95MB | ✅ |
| 5 | 顾问式交互 | ≥ 90% 带选项 | 100% | ✅ (mock 模板生成) |

**5/5 缺真 LLM 验证** — 因为 daemon 未启动 + AIProvider CLI 路径未跑通。

---

## 4. 关键不达标项（4 项）

### ❌ 不达标 1: T-6.1 Electron↔RN 桥接未真兑现 — 渲染区纯白空白

**症状**:
- `open /Applications/灵犀演示.app` 启动成功（PID 90687 + 4 helper）
- 窗口标题 "灵犀演示 · T-6.1 桥接" 在
- **lsappinfo "StandardWindow"=[ NULL ]** ← 报无标准窗口
- AppleScript UI element: `group 1` + `button 1/2/3` (红黄绿 traffic light)，**0 个 5 路由 UI**
- 截图 `screenshots/PM-FINAL-ACCEPT/03_lingxi_active_blank.png` (969KB) 渲染区 100% 纯白

**根因**:
1. packaged app `/Applications/灵犀演示.app/Contents/Resources/app/` 只有 4 文件:
   - main.js (8421 bytes)
   - preload.js (1411 bytes)
   - renderer.html (473 bytes)
   - package.json (286 bytes)
   - **❌ 缺 dist/renderer.bundle.js**（vite build 产物）
   - **❌ 缺 src/renderer.jsx**（RN renderer 入口）
2. `apps/desktop/electron-shell/dist/` 实际只有 electron-builder 产物 (mac/, mac-arm64/, *.dmg, *.zip) — **renderer.bundle.js 从未生成**
3. `git log --all -- "apps/desktop/electron-shell/dist/renderer.bundle.js"` 返空 — **git 没跟踪过**这个文件
4. `renderer.html` 第 14 行 `<script src="./dist/renderer.bundle.js"></script>` 加载 404，#root div 空
5. main.js line 56-60 已有 fallback warning: "dist/renderer.bundle.js 不存在, 启动 BrowserWindow 将显示 5 路由占位" — 但实际连占位都没显示（脚本 404 全失败）

**对比 23:50 PM 报告**: 老 LingxiDemo 还有 4 个"场景"radio + 1 个空黑渲染区；T-6.1 治本后变成 **0 个 radio + 0 个黑/白渲染区**（UI 反而退步）

**真因分类**:
- T-6.1 worker `febf330 feat(electron-bridge)` commit 了 main.js + renderer.html + vite.config.js + preload.js + package.json，**但没跑 `yarn build:renderer`**
- T-6.8 重打 DMG 时，electron-builder 配 `"files": [..., "dist/renderer.bundle.js", ...]` 但 dist 里没这个文件 → 打包时 silent skip
- verifier 4 adversarial probes 验了 PNG unique sha256 + cp file byte match + Python 复算指标 + worktree vs main 一致 — 但**没真机启动 app 验窗口 UI**

### ❌ 不达标 2: T-6.3 "9 硬指标真 runtime" 实际是 harness mock — daemon 未在跑

**症状**:
- `npx tsx apps/desktop/cli/full-demo.ts` 第一步 `FATAL: LINGXI_DAEMON_PORT not set`
- `lsof -iTCP -sTCP:LISTEN | grep -E "lingxi|daemon"` 返空 — **daemon 没监听任何端口**
- `pgrep -lf daemon` 看到的全是 macOS 系统 daemon (systemstats / cfprefsd / distnoted / WindowServer / CoreSimulator) — **无 LINGXI AIProvider daemon**

**根因**:
- full-demo.ts 设计要求 `LINGXI_DAEMON_PORT` 环境变量
- daemon 启动需要 `python -m backend.daemon.server`（在 lingxi-runtime/backend/daemon/）
- packaged app 没自动启 daemon；T-6.8 "重新打 DMG + 装" 没把 daemon 启动集成到 app lifecycle
- T-6.3 worker `610188b feat(runtime): T-6.3 真 runtime 9 硬指标 10 次 demo 验证` 实际跑的是 `apps/desktop/cli/real-runtime-validate.ts`（harness mock）— 文件名带"harness" 暗示是模拟

### ❌ 不达标 3: T-G4-macos "10/10 北极星 100%" 实际是 mock — 4 格式 size 100% 相同

**症状**（来自 `docs/north_star_validation.md`）:
```
| run | pptx | pdf | docx | html |
| 01 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| 02 | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
| ... 10 次 ...  | 71.6 KB | 6.3 KB | 9.2 KB | 4.1 KB |
↑ 4 格式 10 次 size 完全相同 = 假 data
```

preview_latency 90-212ms (avg 120ms) / advisor_latency 73-157ms (avg 94ms) — fakeFetch 50ms 假响应，**不是 LLM 真生成**

**根因**:
- T-4.1 + T-G4-macos 跑的是 `apps/desktop/cli/north-star.ts` + `gate4-macos-rerun.ts`（CLI 脚本，直接调 file_kb / advisor / output 模块，不走 daemon）
- output 模块 T-1.5 jest 单元用 fakeFetch mock 50ms
- LLM 真调用链路（HTTP daemon → AIProvider CLI/API 兜底）从未在端到端 demo 跑过

### ❌ 不达标 4: delivery.md §2 table 缺 Phase 6 9 task 状态行（文档 stale）

**症状**:
- delivery.md §2 表格最后一行是 T-5.1（2026-07-10 19:43 done）
- Phase 6 9 task（T-6.0~6.8 + T-G4-macos + T-G4-win）**没在 §2 table 出现**
- 仅 Changelog (line 93-109) + 现状补段 (line 543) 提及

**根因**:
- PM 19:43 Phase 5 收尾时未跑 5-min cross-doc audit（钉子 #38 当时未入库）
- 钉子 #38 入库后（T-6.5 2026-07-11 00:25），PM 未回头补 §2 table Phase 6 状态行

---

## 5. 一针见血根因

**Phase 6 治本是"治标不治本"** — worker 走通 cli 脚本 + jest 单元 + git merge，**没真打通"app lifecycle → daemon → 真 LLM"端到端链路**。

| 治本目标 | 实际做法 | 缺什么 |
|---|---|---|
| T-6.1 5 路由真显示 | commit 桥接代码 + main.js fallback | 没跑 `yarn build:renderer` 生成 bundle.js |
| T-6.2 KB 真持久化 | 改 storage.ts user data dir | ✅ 这个真做对了 |
| T-6.3 9 硬指标真 runtime | 跑 harness mock cli | 没启 daemon / 没真接 LLM |
| T-6.4 命名统一 | 改 electron-builder config | ✅ 真做对了 |
| T-6.8 DMG v0.2.0 + 装 | 跑 electron-builder | 没验 packaged app 窗口 UI 渲染内容 |
| T-G4-macos 10/10 | 跑 north-star.ts cli | 没走 daemon / 没验 4 格式 10 次 size 差异 |

**最致命的 1 条**:
> **T-6.1 桥接 = "装了但用不了"**。4 PID 跑是表面活，**窗口内容是白板** — NJX 09:48 拍"4 文档基线验收"时如果只看 PHASE_6_FINAL_VERIFICATION.md "VERDICT PASS" 会误判项目已完成。

**PM 失职反例**:
- 19:43 Phase 5 收尾没跑 5-min audit → 23:50 NJX cue 才发 PM_VERIFICATION_2026-07-10.md 暴露 6 不达标项
- 钉子 #38 入库后未回头补 delivery.md §2 Phase 6 状态行
- verifier 4 adversarial probes 全过 — 但**没一条验"窗口内容是否真渲染 5 路由"**
- PHASE_6_FINAL_VERIFICATION.md 写 VERDICT PASS — 是 PM 自己签的

---

## 6. 迭代方向（治本路径 — 至少 4 wave）

### Wave 1 (1h): T-6.1 vite build 治本 — 让 packaged app 真显示 5 路由

1. `cd apps/desktop/electron-shell && yarn install --include=dev`（装 vite + @vitejs/plugin-react + react-dom）
2. `yarn build:renderer`（vite build，产物 dist/renderer.bundle.js）
3. `yarn build:mac` 重打 DMG（v0.2.1）
4. `cp -R dist/mac-arm64/灵犀演示.app /Applications/`（覆盖安装）
5. `open /Applications/灵犀演示.app` 启动
6. **真机验收**:
   - cu MCP 截 BrowserWindow 内容 → screenshots/W1-final/01_5_routes.png
   - AppleScript UI element 验 5 路由 + 4 场景 radio
   - 截 5 路由逐张 (file-kb / advisor / template / preview / output)
7. **失败回滚**: 渲染区还是白板 → vite build 报错漏掉 / renderer.jsx 入口错

### Wave 2 (2h): T-6.3 daemon 真启 + 真 LLM 链路

1. `python -m backend.daemon.server` 启 daemon（占随机端口 56140 / 65413 之类）
2. 修 T-1.0.a daemon 启动方式：从 packaged app lifecycle (main.js on app ready) 启
3. 改 T-6.8 packaged app 的 main.js: app ready 后 spawn daemon 进程，写 PING 到 main app data dir 的 daemon-port.json
4. main process preload.js 暴露 `getDaemonPort()` 给 renderer
5. renderer.jsx 启动时从 main 拿 daemon port，调 `/v1/chat` 真发请求
6. **真机验收**:
   - full-demo.ts 跑通 5 模块 + 真 LLM 返回（不是 mock）
   - 4 格式 size 在 10 次 demo 之间有合理波动（不是 100% 相同）
7. **失败回滚**: LLM 401 / network 断 → API provider 兜底（goal.md §7 拍板）

### Wave 3 (1h): T-G4-macos 真 runtime 重跑 10 次

1. 启 daemon (Wave 2 之后)
2. `npx tsx apps/desktop/cli/north-star.ts --runs=10 --real-llm`
3. 验 4 格式 size 在 10 次之间有差异（LLM 生成内容不同 → size 必有差）
4. 截 11 PNG 物证（10 runs + summary）
5. 写 `docs/north_star_validation_v2.md` 覆盖旧版
6. **真机验收**: preview_latency 应该是 1-5s (真 LLM)，不是 100ms (mock)

### Wave 4 (30min): docs 一致性 + 钉子 #38 实战

1. 补 delivery.md §2 table Phase 6 9 task 状态行
2. delivery.md §3 加 T-6.x 详情段（当前缺失）
3. PHASE_6_FINAL_VERIFICATION.md VERDICT 改 ❌ → 等 Wave 1-3 完后再 PASS
4. 加钉子 #40: "verifier 4 adversarial probes 必加 '真机启动 app 截 BrowserWindow 内容' 一条"

---

## 7. PM 自检 + 钉子沉淀

### PM 失职
- ❌ 19:43 Phase 5 收尾没跑 5-min audit（钉子 #38 当时未入库，但 PM 应自跑）
- ❌ 钉子 #38 入库后未回头补 delivery.md §2 Phase 6 状态
- ❌ PHASE_6_FINAL_VERIFICATION.md 写 VERDICT PASS 时未做真机 verify
- ❌ verifier 4 adversarial probes 全过 — PM 没要求加"真机启动 app 截 BrowserWindow 内容"

### 新增钉子
- **钉子 #40 (PM verifier probes 必含真机 app 启动 + 截窗口内容)** — 写入 mavis-runtime-discipline.md
- **钉子 #41 (T-6.x 类"治本" task 必真跑 build / install / 启动 三件套)** — 写入 mavis-runtime-discipline.md
- **钉子 #42 (北极星 N 次 demo 的 4 格式 size 必有合理波动 = LLM 真生成；size 100% 相同 = mock 假 data)** — 写入 mavis-runtime-discipline.md

---

## 8. 验收记录路径

| 类别 | 路径 |
|---|---|
| 物证 ASCII | `/tmp/lingxi_evidence.txt` |
| 截图 3 张 | `screenshots/PM-FINAL-ACCEPT/{01_initial_desktop, 03_lingxi_active_blank, 04_after_text_evidence}.png` |
| 4 文档 v2 | `goal.md / plan.md / rules.md / delivery.md / phase6_plan.md` |
| Phase 6 治本报告 | `docs/PHASE_6_FINAL_VERIFICATION.md` |
| 23:50 PM 报告 | `docs/PM_VERIFICATION_2026-07-10.md` |
| 09:51 PM 报告（本） | `docs/PM_VERIFICATION_2026-07-11.md` |

---

**VERDICT: ❌ 不通过 — Phase 6 治本半成品，4 项硬指标未真兑现。需 Wave 1-3 治本（约 4h）后重验。**

**下一步**: NJX 拍板 — A) 立即启动 Wave 1-3 治本 (推荐 - 节奏感) / B) 收缩到"v0.1.0-beta + 显式 mock 标注"交付 (最快) / C) 暂停 / 收摊
