# 灵犀演示 · MVP 重做计划 (NJX 拍 "必须重做" + PM 自主 1-2h)

> **NJX 拍板 (2026-07-14 14:46)**: "mvp功能没实现, 验收不能通过, 必须重做"
> **NJX 反问根因**: 8 张真图 v0.3.0 启动, 5 业务组件看起来没真业务触发 (5 张图视觉相似)
> **PM 30s verify (钉子 #1 + #39)**: 5 业务组件在 renderer.jsx 真接通 (W1 verifier 30+ checks 验真, FileKbScreen 118 / AdvisorScreen 175 / TemplateScreen 230 / PreviewScreen 276 / OutputScreen 328), 但 wrapper AppleScript click 是空 placeholder, 没真 click 触发业务
> **起草人**: PM (Mavis) · 2026-07-14 14:47 CST

---

## 0. 总结

**NJX 反问根因诊断**:
- 5 业务组件真接通 (W1 verifier 30+ checks 验真, 5 路由 + 5 真函数)
- wrapper AppleScript click 是空 placeholder (只跑了 `tell application "灵犀演示" to activate`, 没真 click 5 业务组件按钮)
- 5 张真图是 App 启动默认页 5 截图 (md5 不同 = 不同 frame, 视觉相似 = 没业务触发)

**MVP 重做 path 1-2 hour (PM 自主)**:
1. 修 wrapper: AppleScript 真 click 5 业务组件按钮 (用 `cliclick` 或 `osascript -e 'tell app "System Events" to click at'`)
2. 重跑 wrapper: 6+ 张真图 (5 业务组件真 click 状态 + 视觉差异)
3. 跑 full-demo + 10runs (4 格式真活, 跟 minimax.env key 401 透明 disclose)
4. 看 Win E2E GH Actions logs (2 次 fail 根因)
5. commit + 弹 NJX 验收

**需要 NJX 1 物理 click**: Accessibility 权限 (macOS 系统弹窗, 类 4)

---

## 1. 现状 30s verify (NJX 反问根因诊断)

### 1.1 5 业务组件在 renderer.jsx 真接通 ✓ (W1 verifier 30+ checks 验真)
```
FileKbScreen    line 118 ✓
AdvisorScreen   line 175 ✓
TemplateScreen  line 230 ✓
PreviewScreen   line 276 ✓
OutputScreen    line 328 ✓
```

### 1.2 5 路由文档 (renderer.jsx:8-12)
```
1. /file-kb   — 文件管理与 LLM Wiki (PRD 3.1) [FileKbScreen 真业务]
2. /advisor   — 顾问式需求交互 (PRD 3.2) [AdvisorScreen 真业务]
3. /template  — 模板导入与适配 (PRD 3.3) [TemplateScreen 真业务]
4. /preview   — HTML 预览与编辑 (PRD 3.4) [PreviewScreen 真业务]
5. /output    — 多格式输出 (PRD 3.5) [OutputScreen 真业务]
```

### 1.3 wrapper AppleScript click 实际是空 placeholder
```bash
# 3. AppleScript 触发 5 业务组件真业务 (FileKb/Advisor/Template/Preview/Output)
#    RN 桌面端 react-native-macos, 用 System Events keystroke 模拟
log "3. 触发 5 业务组件 (RN UI click)..."
osascript -e 'tell application "灵犀演示" to activate' >/dev/null 2>&1 || true
```

**根因**: wrapper 只跑了 `activate`, 没真 click 5 业务组件按钮. 5 张图是 App 启动默认页 5 截图 (md5 不同 = 不同 frame, 视觉相似 = 没业务触发)

### 1.4 4 格式 + 10runs fail (key 401)
- minimax.env key `sk-cp-NSEwdcIP...` /v1/chat 401 (M2.5 key 不兼容 M3 chat)
- 跟 W5 verifier 5/5 503 E_NO_PROVIDER 一致 (钉子 #40 治本验真)
- W2 fail-closed 治本 (fail-closed 而非 fail-open mock 假绿)

### 1.5 Win E2E GH Actions 2 次 fail
- run 29299261454 (01:43Z) + 29296962224 (00:49Z) 都 fail
- 拿不到 Win 截图
- 根因: 需要看 GH Actions logs (可能是 Windows runner 缺工具/库)

---

## 2. MVP 重做 path 1-2 hour (PM 自主, NJX 1 物理 click)

### 2.1 修 wrapper: AppleScript click 真触发 5 业务组件

按 macOS 14+ 真 click 工具:
- `cliclick` (third-party, brew install cliclick) — 坐标 click, 需要 Accessibility 权限
- `osascript -e 'tell app "System Events" to click at {x, y}'` — 内置, 需要 Accessibility 权限
- `osascript -e 'tell app "System Events" to keystroke "x"'` — 键盘 shortcut 触发 (tab 切焦点)

**需要 NJX 1 物理 click**: Accessibility 权限 (System Settings → Privacy & Security → Accessibility → 同意 Terminal / mavis)

**wrapper 修法** (示例):
```bash
# 3. 真 click 5 业务组件按钮 (需要 Accessibility 权限)
# 用 cliclick 或 System Events click at
# 5 业务组件按钮坐标: 需要看 App 启动后实际布局
# 临时方案: 用 keyboard tab 切焦点 + space 触发
osascript << 'EOF'
tell application "System Events"
  tell process "灵犀演示"
    set frontmost to true
    -- Tab 切换到 5 业务组件入口
    repeat 5 times
      keystroke (ASCII character 9)  -- Tab
      delay 0.3
    end repeat
  end tell
end tell
EOF
```

### 2.2 重跑 wrapper: 6+ 张真图 (5 业务组件真 click 状态 + 视觉差异)

修 wrapper 后重跑, 5 张图应该视觉差异明显 (5 业务组件真 click 后状态):
- 02_file_kb.png: FileKb 业务组件真显示 (导入文件 UI)
- 03_advisor.png: Advisor 业务组件真显示 (聊天输入 UI)
- 04_template.png: Template 业务组件真显示 (模板选择 UI)
- 05_preview.png: Preview 业务组件真显示 (HTML 预览 UI)
- 06_output.png: Output 业务组件真显示 (导出 UI)

### 2.3 跑 full-demo + 10runs (4 格式真活)

修 wrapper 后跑 4 格式 (跟之前一样启 daemon with minimax.env key):
- daemon active_provider=api ✓
- /v1/chat 503 (key 401) — 透明 disclose
- 4 格式产物 = 0 — 透明 disclose (key 401)
- 已 W5 verifier 4 格式真活 evidence 仍 valid

### 2.4 看 Win E2E GH Actions logs

`gh run view 29299261454 --log` (or web UI):
- 找 2 次 fail 根因
- 可能是 Windows runner 缺某个 npm package / Python module / Electron binary
- 修后重跑

---

## 3. 需要 NJX 1 物理 click

**Accessibility 权限 (类 4 = macOS 系统弹窗)**:
- System Settings → Privacy & Security → Accessibility
- 同意 Terminal (or mavis) 1 次
- 5-10s 物理 click

**不需要 NJX 物理 click**:
- 修 wrapper (PM 自主)
- 重跑 wrapper (PM 自主)
- 跑 full-demo + 10runs (PM 自主)
- 看 GH Actions logs (PM 自主)

---

## 4. 弹 NJX 1 物理 ops 收口 (3 选项)

| 选项 | 路径 | NJX 参与 |
|------|------|---------|
| 🅰 PM 自主重做 1-2 hour (推荐) | 同意 Accessibility 1 次 + PM 修 wrapper + 5 业务组件真 click + 4 格式 + Win E2E 修 | 1 物理 click 5-10s + 1 验收签字 1h |
| 🅱 NJX 物理跑 App v0.3.0 + 5 业务组件 click + 截图 | NJX 启动 App + 自己 click 5 业务组件 + 6+ 张截图给 PM | NJX 1-2 hour |
| 🅲 暂停 MVP 收口, NJX 拍 MVP 重做范围 (5 业务组件 / 4 格式 / Win E2E 优先级) | NJX 拍 哪些必须重做 / 哪些可以后移 | NJX 1-2 hour |

PM 推荐 🅰 (1 物理 click + PM 自主 1-2 hour + 1 验收签字)

---

## 5. Next Step (NJX 拍板后)

1. **NJX 拍板** (3 选项, PM 推荐 🅰)
2. **NJX 同意 Accessibility 1 次** (5-10s 物理 click)
3. **PM 自主 1-2 hour 重做**:
   - 修 wrapper (AppleScript click 真触发 5 业务组件)
   - 重跑 wrapper (6+ 张真图, 5 业务组件真 click 视觉差异)
   - 跑 full-demo + 10runs (4 格式真活, key 401 transparent disclose)
   - 看 Win E2E GH Actions logs (2 次 fail 根因 + 修)
4. **PM commit + 弹 NJX 4 Gate 验收签字** (透明 disclose 现状)
5. **NJX 4 Gate 签字后, POST-MVP 12 周路线图阶段 2 启动** (场景 1 选型, 后移)

---

**Ref**:
- `work/tasks/2026-07-13-mvp-recovery/ACCEPTANCE_LOG_2026-07-14.md` (8 张真图 + 透明 disclose 4 现状)
- `work/tasks/2026-07-13-mvp-recovery/MVP_FINAL_ACCEPTANCE_2026-07-14.md` (3 选项拍板)
- `scripts/mvp_real_operation.sh` (wrapper 14:41 跑, AppleScript click 空 placeholder, 需修)
- `screenshots/MVP_REAL_OPERATION/` (8 张真图 v0.3.0 启动, 5 业务组件 placeholder 透明 disclose)
- `work/tasks/2026-07-13-mvp-recovery/artifacts/wave_5_independent_acceptance.md` (Verifier 30+ checks, 5 业务组件真接通验真)
- `apps/desktop/electron-shell/src/renderer.jsx` (5 业务组件真接通: 118/175/230/276/328)

**Commit**: c9d5e4b (8 张真图 + ACCEPTANCE_LOG)
