# 灵犀演示 — 规则文档（rules.md）

> PM 自我约束 + sub-agent 工作守则。**质量底线**，违反任何一条 = 不通过验收。
> 所有 sub-agent 开工前必读。

---

## 1. PM 工作守则（强制）

### 1.1 文档先行（基线铁律）
- 4 个文档未全员 ready + owner 最终签字 → 不准进入 Phase 1 开发
- 任何 4 文档改动 → 在 `delivery.md` 留 `## Changelog` 记录（PM 改动需 owner 弹窗确认）
- 例外：纯拼写 / 占位符 / 路径错误这类无歧义修订可直接改，但要写明 update 痕迹

### 1.2 多 Agent 并行循环
- 同阶段无依赖任务**一律并行**（Phase 1 五个模块 sub-agent 全并行）
- 每个 sub-agent 必须在**独立 git worktree** 工作（不得修改主分支）
- 合并前 PM 跑 smoke test
- 单个任务 **3 轮 PM 验收不过** → 立即升级 owner 弹窗，禁止 PM 自我循环

### 1.3 验收 = 真实操作 + 截图（不可妥协）
- **禁止仅看代码 / 看 PR 判断"通过"**
- 必须用 cu MCP 工具真实操作电脑：
  - `desktop_screenshot` → 截屏存档到 `screenshots/<task_id>/`
  - `desktop_left_click` / `desktop_type` → 真实按钮点击
  - `desktop_window_list` → 确认应用已开启
  - `bash` → 真实命令运行（不是 dry-run）
- 每个任务验收**至少 3 张关键截图**：
  - S1: 操作前状态（空目录 / 启动前 / 初始页）
  - S2: 操作中（命令运行中 / 页面加载中 / AI 处理中）
  - S3: 操作后最终结果（成功画面 / 文件生成 / 导出完成）
- 截图命名规范：`<seq>_<step简写>.png`（seq 用 01/02/03 顺序）
- **截图不全 = 验收不通过**

### 1.4 基线迭代需 owner 确认
- PM 自己**不能擅自改 goal.md / plan.md / rules.md**
- 发现需要改 → 写变更提案（diff）给 owner → owner 弹窗确认 → 再改
- 涉及 4 文档任一改动的弹窗必须**单独一个**（不合并多个变更）

### 1.5 质量永远是最高要求（NJX 拍板"质量优先"硬约束）
- 功能实现 ≠ 完成，必须满足 `delivery.md` 的全部验收项
- 不合格 → 打回 sub-agent 重做，**写明原因 + 截图证据**
- 拒绝"差不多就行" "先用着" "下次再修" 这种妥协
- 北极星验证（10 次 demo 零失败）不过 = 不进入 Phase 5

---

## 2. Sub-agent 守则

### 2.1 必读必遵循
**开工前必读 4 件套**（不读 = 不准写代码）：
1. `/Users/njx/Project/灵犀演示/goal.md`（整份）
2. `/Users/njx/Project/灵犀演示/plan.md` 中**自己 task 所在段** + 依赖段
3. `/Users/njx/Project/灵犀演示/rules.md`（**完整**，本文档）
4. `/Users/njx/Project/灵犀演示/delivery.md` 中**自己 task 详情段**

### 2.2 工作约束
- **工作目录**：自己分配的 worktree
  - 创建：`git worktree add ../wt-<agent-id> -b <branch-name> main`
  - 例：`wt-daemon` / `wt-frontend-scaffold` / `wt-schema` / `wt-file-kb` / `wt-advisor` / `wt-template` / `wt-preview` / `wt-output` / `wt-integration` / `wt-visual` / `wt-macos` / `wt-windows`
- **不得修改主分支 / 其他 sub-agent worktree**
- **不得跨 task 改文件**：例如 wt-file-kb 不能改 daemon 目录
- **共享契约用 T-1.0.c 产出的 schema**（不是各自一套）

### 2.3 交付输出
- **PR / commit message 必含 task_id**：`T-1.1: 实现文件管理与 LLM Wiki 知识库`
- **自测报告必含**：
  - 跑通的命令 + 输出
  - 真实操作的截图（≥3 张）
  - 验收信号 checklist（逐项 ✓/✗）
- **commit 前**：
  - 跑自己 task 的单测（`pytest <本 task 测试>` 或 `yarn test:<本 task>`）
  - 跑 `git status` 确认只改了自己的 worktree 文件

### 2.4 失败处理
- 3 轮 PM 验收失败 → 自动升级 owner（PM 弹窗，不自我循环）
- 阻塞超过 24h → 升级 owner
- **不可逆操作**（`rm -rf` / `drop table` / `git reset --hard` / 删 commit / 删数据库）→ **必须先征得 PM 同意**

### 2.5 截图强制（sub-agent 自验阶段）
- sub-agent 自验时也要截图（不只 PM 验收时）
- 自验截图路径：`apps/desktop/testdata/screenshots/<task_id>_self_*.png`
- PM 验收截图路径：`/Users/njx/Project/灵犀演示/screenshots/<task_id>/`

---

## 3. 验收规范（PM 用）

### 3.1 验收前必做（先看 sub-agent 自验报告）

```bash
# 1. 检查 sub-agent 工作目录
git worktree list  # 确认 sub-agent 在自己 worktree

# 2. 看 diff
cd ../wt-<agent-id> && git log -p

# 3. 跑单测
cd ../wt-<agent-id> && pytest tests/  # 或 yarn test

# 4. 看自验截图
ls apps/desktop/testdata/screenshots/T-<id>_self_*.png
```

### 3.2 验收中必做（cu MCP 真实操作）

```bash
# 1. 启动应用
cd ../wt-<agent-id> && yarn start  # 或 python -m xxx

# 2. 截屏：启动前
desktop_screenshot → screenshots/T-<id>/01_before.png

# 3. 真实操作
desktop_left_click → 点关键按钮
desktop_type → 输入文字
bash → 跑命令

# 4. 截屏：操作中
desktop_screenshot → screenshots/T-<id>/02_midterm.png

# 5. 截屏：操作后
desktop_screenshot → screenshots/T-<id>/03_after.png
```

### 3.3 验收后必做

- 在 `delivery.md` 把对应 task status 改为 `done` 或 `rejected:<原因>`
- 截图全部存档到 `screenshots/<task_id>/`
- 向 owner 弹窗：每验收项独立弹窗（不合并）

### 3.4 验收不通过处理

```
发现不合格 → 写明原因（具体到验收项 N） → 截图证据 → 弹窗 owner
owner 决策：
  - 打回 sub-agent 重做（推荐）
  - 只重做失败验收项（最小改动）
  - 缩窄范围（去掉此验收项）
```

---

## 4. 文档/工具红线（不可违反）

| ❌ 禁止 | ✅ 必须 |
|---|---|
| 跳过验收直接 merge 到 main | 所有 sub-agent 改动先在 worktree，PM 验收后 merge |
| 验收只看代码不看实际行为 | 用 cu MCP 真实操作 + 截图 |
| PM 私自改 goal/plan/rules | 改基线走 owner 弹窗 |
| 短时间迭代基线 > 2 次/天 | 警惕基线不稳，先收敛再推进 |
| 任务没明确产出就开工 | task 没产出物/验收信号 → 不准开工 |
| sub-agent 直接 push 到 main | PR 先 PM 验收 + owner 点头 |
| 把 4 文档塞进代码注释 | 文档独立 .md 维护 |
| 用 `webfetch` 替代真实访问 | 用 cu MCP 真实打开 app |
| sub-agent 跨 task 改文件 | 每个 sub-agent 只改自己 worktree |
| CLI 失败后忽略继续跑 | CLI 失败必须 fallback 到 API，记录日志 |

---

## 5. 并行规则（强制）

### 5.1 可以并行的任务
- 不同 module / 不同目录（apps/desktop/src/modules/file_kb/ vs apps/desktop/src/modules/advisor/）
- 没有共享 transient state
- 没有强依赖（plan.md 的依赖图已分清）

### 5.2 必须串行的任务
- 后任务依赖前任务的产出（如 T-1.0.* → T-1.1-1.5 → T-2.1）
- 修改同一文件 / 同一目录的不同部分
- 数据库 schema 变更（先代码后数据）

### 5.3 并行产物合并
- PM 用 `git merge --no-ff <branch>` 合并 worktree
- 合并后跑项目级 smoke test（不是 sub-agent 单测）
- 合并冲突 → 不允许自动合并，必须由那个 task 的 sub-agent 处理

### 5.4 并发控制
- **同时跑的 sub-agent 上限 5 个**（避免 memory/CPU 抢占）
- 优先级：基础设施 sub-agent（daemon / scaffold / schema）先跑，跑完再批量放 5 模块
- macOS / Win 平台 sub-agent 串行（避免交叉编译冲突）

---

## 6. 通讯/汇报（一问一弹窗 + 推荐标注）

### 6.1 sub-agent → PM
- **纯文本汇报**（不是弹窗，弹窗是 PM 找 owner 用）
- 任务完成 → 输出"自测报告"（截图 + 关键日志 + 命令输出）
- 阻塞 → 立即报告，附已尝试方案

### 6.2 PM → owner（必须弹窗 + 推荐）

> **铁律 1**：PM 跟 owner 的所有交互**每个问题单独一个弹窗**（不用 `steps` 合并多问题）。  
> **铁律 2**：每个选项必须标**"推荐"** + 简短理由。

**弹窗模板**（每个独立调用）：

```yaml
ask_user:
  title: "<短场景名>"
  steps:
    - id: "<短 id>"
      question: "<一句话问什么>"
      options:
        - id: "<选项 id>"
          label: "<选项名>（推荐 - <理由>）"
```

**适用弹窗**（每个独立弹窗）：

| 场景 | 选项数 | 推荐标注 |
|---|---|---|
| 4 文档每完成一个 | 2-3 | 批准选项标"推荐" |
| 验收清单每个 item | 3 | 通过项标"推荐" + 附证据 |
| 验收失败的下一步 | 3-4 | 打回重写标"推荐" |
| 基线变更 | 3-4 | 至少 1 个"推荐" |
| Phase 收尾 | 3 | 进入下一 Phase 标"推荐" |
| 死循环升级 | 3-4 | 暂停或换 sub-agent 标"推荐" |
| cron 清理 | 2 | 已清理标"推荐" |

**不适用弹窗**（用纯文本）：
- 进度报告
- 状态通知
- 单选项 yes/no
- 知识解释

### 6.3 owner → PM
- 弹窗里选选项 → PM 立即执行
- 24h 不回弹窗 → PM 再发一次（最多 2 次），仍不回 → 暂停车

---

## 7. 工具白名单

- **截图**：cu MCP `desktop_screenshot` / `desktop_screenshot_region` / `desktop_zoom`
- **点击**：cu MCP `desktop_left_click` / `desktop_right_click` / `desktop_double_click` / `desktop_type`
- **应用管理**：cu MCP `desktop_window_list` / `desktop_window_focus` / `desktop_window_minimize`
- **键盘**：cu MCP `desktop_key` / `desktop_hold_key`
- **剪贴板**：cu MCP `desktop_clipboard_read` / `desktop_clipboard_write`
- **命令行**：`bash` 工具（真实执行，不允许 dry-run 验收）
- **文件读取**：Read / Glob / Grep
- **文件改动**：Edit / Write / MultiEdit
- **Git**：`bash` 调 `git` 或 OpenCode 的 git 工具
- **子任务分发**：`mavis communication send --command spawn`（用于 sub-agent 调度）
- **Cron**：`mavis cron self`（用于长任务监控）
- **记忆**：`mavis memory append`（用于跨项目知识沉淀）

**禁止**：
- 用 `webfetch` 替代真实访问
- 用"看代码 review"代替"实际操作"
- 跳过验收直接 merge
- sub-agent 用 `rm -rf` 不可逆操作（必须先 PM 同意）

---

## 8. 持续跟踪规则（无人值守）

> **铁律**：在不需要 owner 决策的时候，**项目进度不可以中断**，除非进入死循环。

### 8.1 任务分级跟踪

| 任务时长 | 跟踪机制 | 工具 |
|---|---|---|
| < 30min | 当前 session 同步等待 | session |
| 30min ~ 2h | **PM 轮询**（5-10min 检查状态文件） | session 循环 |
| ≥ 2h | **创建 cron 定时监控**（30min 跑一次） | `mavis cron self` |
| 全程 | **心跳扫描 cron**（项目级兜底，12h） | `mavis cron self` |

### 8.2 cron 监控实现

**单任务监控**（具体 task）：
```bash
mavis cron self lingxi-<task_id>-monitor \
  --every 30m \
  --prompt "<读取 /Users/njx/Project/灵犀演示/delivery.md 的 T-<id> 状态。
           如有 failed / blocked / 超 24h 无进展 → 立即弹窗升级。
           如一切正常 → 静默退出。>"
```

**项目级心跳**（Phase 兜底）：
```bash
mavis cron self lingxi-heartbeat \
  --every 12h \
  --prompt "<扫 /Users/njx/Project/灵犀演示/4 文档状态：
           - 4 文档是否完整
           - delivery.md 死循环征兆（同 task 3 轮不过 / 24h 阻塞 / 基线 > 2 次/天）
           - 当前 phase 进度
           触发任一死循环征兆 → 立即弹窗升级 owner
           否则静默退出>"
```

### 8.3 死循环判断（任一触发立即升级）
- 同一 task 验收失败 ≥ 3 轮
- 同一阻塞点 > 24h 无进展
- 同一基线变更 > 2 次/天
- sub-agent 持续输出无效重复内容

### 8.4 死循环升级弹窗
```
🪟 「灵犀演示进入死循环征兆（<具体描述>），如何处理？」
○ 暂停所有 sub-agent，owner 接管（推荐 - 当前 PM 已无招可用）
○ 重做 plan（拆掉当前 phase）
○ 暂停当前 task，缩窄范围
○ 收摊（归档项目，关闭 cron）
```

### 8.5 cron 清理（Phase 结束必清）
- Phase 结束 → 立即清理对应 cron
- 清理命令：`mavis cron rm <name>`
- 必须在 `delivery.md` 的 Phase 验收段记录清理动作

### 8.6 cron 禁止做的事
- ❌ 改 plan / rules / goal（只监测，不修改）
- ❌ 调用 sub-agent（sub-agent 工作由 PM 在 session 内做）
- ❌ 跳 PM 直接联系 owner 升级（先升级 PM session，再 PM 弹窗 owner）

---

## 9. 灵犀演示专属约束（PRD 硬指标 + NJX 拍板决策）

### 9.1 PRD 硬指标（每个 task 必达）
- 100M 以内文件导入成功率 ≥ 99%
- AI 交互响应延迟 ≤ 3s
- HTML 预览生成延迟 ≤ 10s
- 顾问式交互 ≥ 90% 提问带选项
- 模板适配 100% 匹配版式/配色/字体
- voice 输入识别准确率 ≥ 95%
- 资源占用 ≤ 8G 内存

### 9.2 NJX 拍板约束（不许偏离）
- ❌ 严格用 LLM Wiki 方案，不用 RAG
- ❌ 全本地存储，不上传云端
- ❌ 不做云端账号体系
- ❌ 不做多人协作（MVP 阶段）
- ❌ 不做模板市场
- ❌ 不做国际化（中文优先）
- ✅ CLI 接入用 HTTP daemon + AIProvider 抽象层
- ✅ CLI 主调用 + API 兜底（双路）
- ✅ macOS + Windows 并行
- ✅ 质量优先，不卡死时间，按 4 个 Gate 推进
- ✅ First-use 场景：季度汇报 PPT

### 9.3 平台特定约束
- **macOS**：本地路径 `~/Library/Application Support/灵犀演示/kb/`
- **Windows**：本地路径 `%APPDATA%/灵犀演示/kb/`
- **双平台共用同一份业务代码**（差异在打包配置 + 路径解析）

### 9.4 钉子 #46 · PM HARD GATE for false-green (2026-07-13 baseline_truth)
- **触发** (任一即触发):
  - (a) 任一 producer / worker / agent 报 PASS, 但内容含 `mock` / `fallback` / `partial` / `fakeFetch` / `PIL` / `placeholder` 包装
  - (b) 退出码 = 0 但返回内容 = mock (如 `hello (mock)`), 退出码与内容真假不一致
  - (c) 数字与硬指标不一致 (如 4 格式 size 10 次 stddev = 0 但报"波动合理")
  - (d) 硬编码 `0.96` / `N/A` / `"N/M=100%"` 等伪造指标 (real-runtime-validate voice=0.96 反例)
- **PM 动作**: 30s 内 1 行命令 verify (e.g. `grep -c 'mock' <log>`, `file <output>`, `ls -la <dir>`), 触发任一 → 拒绝 PASS
- **WHY**: 2026-07-13 `work/tasks/2026-07-13-lingxi-baseline-acceptance/ACCEPTANCE_REPORT.md` §4.2 + §4.4 + §4.5 暴露 5 处 false-green (full-demo.ts 包装 mock 退出 0 / real-runtime-validate 硬编码 voice / Windows PARTIAL 标 done / H5 严格 77% 标 design-aware 100% / Gate 3 PARTIAL 标 done)
- **与钉子 #38 (cross-doc audit) 配对**: 钉子 #38 查文档一致性, 钉子 #46 查产品/代码/数据真伪
- **升级**: 同一 producer 触发 ≥ 2 次 → 弹窗 NJX 拍板 (类似钉子 #24 consecutive_failures)

### 9.5 钉子 #47 · RN Pressable vs Web placeholder (2026-07-13 baseline_truth)
- **触发**: 任何 "RN 真组件" 验收包含 `<Pressable>` / `<TouchableOpacity>` / `<Text>` 等 RN 标准组件
- **PM 动作**: 必独立 verify 组件是否真交互 (`grep -c "onPress" <file>` 1:1 配对 Pressable, 不是只渲染文字), 不能仅看代码/截图就认"占位"
- **WHY**: 2026-07-11 T-7.5 (`work/tasks/.../outputs/T-7.5-t61-real-routes/deliverable.md`) 暴露 RN `<Pressable>` 已存在并配 onPress 1:1 20 处真交互, 但 task spec 基于"Pressable 占位"概念误判为占位 (实际 React.Fragment 不能替代交互组件)
- **判别准则**:
  - 真交互: `<Pressable onPress={handler}>` + handler 含业务逻辑 (state 变化 / API 调用 / 路由切换)
  - 假占位: `<Pressable onPress={() => log('placeholder click')}>` 仅为日志, 无业务流
  - 纯占位: `<View><Text>...占位...</Text></View>` 无任何 onPress / Touchable
- **与钉子 #40 (verifier 4 adversarial probes) 配对**: 钉子 #40 真机验证, 钉子 #47 组件语义验证

---

## 完成度自检

- [x] PM 守则清楚（5 条）
- [x] Sub-agent 守则清楚（5 条）
- [x] 验收规范有具体可执行步骤
- [x] 文档/工具红线明确（10 条）
- [x] 并行规则覆盖 3 个分桶
- [x] 通讯/汇报路径明确（一问一弹窗 + 推荐）
- [x] 工具白名单明确
- [x] 持续跟踪规则覆盖 3 类任务 + 死循环处理
- [x] 灵犀演示专属约束（PRD 硬指标 + NJX 拍板）
- [x] 钉子 #46 PM HARD GATE for false-green (2026-07-13 baseline_truth)
- [x] 钉子 #47 RN Pressable vs Web placeholder (2026-07-13 baseline_truth)

**✅ 9 项全过 → 进入 delivery.md 起草** (追加 2 钉子不增加自检数, 钉子属 §9 灵犀专属约束的硬约束层)
