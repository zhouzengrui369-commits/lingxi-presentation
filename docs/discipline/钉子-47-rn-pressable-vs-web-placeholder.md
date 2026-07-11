# 钉子 #47 · "5 路由 Pressable 占位" 误判 — RN `<Pressable>` ≠ web placeholder, React.Fragment 不能替代交互组件

> **Source-of-truth**: `/Users/njx/.mavis/agents/mavis/memory/mavis-runtime-discipline.md` line 632-673 (canonical, mavis agent memory).
>
> **本文为 project-internal mirror**, 2026-07-11 22:10 Phase 7 T-7.5 收口, 给灵犀演示项目内 traceability 用.
> 改源 → 改 mavis agent memory; 不要改本文件 (会跟源脱钩).

## 现象 (T-7.0 gap-assessment sub-agent 报 G-6)

> "5 路由 Pressable 占位未替换 React.Fragment 真组件" — 派发 T-7.5 "5 路由 React.Fragment 真组件替换占位 Pressable"

## 实际查证 (T-7.5 worker 22:11 跑 `grep -c "onPress" 6 文件`)

- `router.tsx` — 1 onPress (tab 切换, 真交互) ✅
- `file_kb/FileKbScreen.tsx` — 2 onPress (导入/刷新按钮, 真交互) ✅
- `advisor/index.tsx` — 8 onPress (场景卡/选项/确认/重选/语音, 真交互) ✅
- `template/index.tsx` — 3 onPress (导入/主题切换/应用, 真交互) ✅
- `preview/index.tsx` — 3 onPress (上下移/重做, 真交互) ✅
- `output/index.tsx` — 1 onPress × 4 format (4 格式输出, 真交互) ✅

6 文件共 20 个 `<Pressable>` + 20 个 `onPress` 1:1 配对 = **全部是 RN 标准 touchable 组件, 用于按钮/tab/options 交互, 不是 placeholder**.

## 根因 2 层

1. **sub-agent 概念混淆**: 把 RN `<Pressable>` (React Native 触控组件名, 来自 `react-native` 包) 误读为 "占位 (placeholder)". Pressable 是 RN 推荐替代 TouchableOpacity/TouchableHighlight 的标准交互组件, **Pressable = "press-able" 可按压**, 不是 "placeholder" 缩写.
2. **React.Fragment 不可替代交互组件**: React.Fragment 是无 DOM 节点 wrapper, 没有任何 onPress / accessibility / style 支持. 把 `<Pressable onPress={...}>` 替换为 `<React.Fragment>` 会**直接破坏 UI** (按钮/tab 全部点不动, RN 抛错). 任务描述的 "Pressable → React.Fragment 真组件" 在 React 语义上不成立.

## vite build 验真 (T-7.5 22:11 跑 `npm run build:renderer`)

- 入口: `apps/desktop/electron-shell/src/renderer.jsx` (web-native React, react-dom) — 这是真占位
- 输出: `dist/renderer.bundle.js` = 149605 bytes (≈ 146 KB)
- 阈值 ≥ 140 KB ✅ — T-6.1 vite build 治本 (commit 5709395 之前的 wave) 稳定 149605B, 当前复跑 build 仍 149605B
- vite config 注释明确: "改用 web-native React (react-dom) 渲染 5 路由占位 + 简单交互" — vite renderer 跟 RN modules 是**两套独立渲染层**, 5 路由 web 占位是设计意图, 不是 bug

## 真占位 vs 真组件 区分 (5 路由 web 渲染层)

| 位置 | 渲染层 | 状态 | 备注 |
|---|---|---|---|
| `apps/desktop/electron-shell/src/renderer.jsx` | Web (react-dom) | **真占位** (`PlaceholderScreen` × 5) | vite build 产物, 5 路由 web 简化版 |
| `apps/desktop/src/router.tsx` | RN (react-native-macos) | 真组件 (tab 导航 + 5 route 注册) | macOS native app 入口 |
| `apps/desktop/src/screens/*.tsx` (5) | RN | 4 真组件 (re-export 或 wrap) + 1 真占位 (`OutputScreen.tsx` 静态 "T-1.5 等待实现" 文本) | 屏入口, 委托给 modules |
| `apps/desktop/src/modules/*/index.tsx` (5) | RN | **5/5 真组件** (Pressable 用法正确) | 5 大 P0 模块业务逻辑 |

## WHY

PRD 3.1-3.5 5 大 P0 模块 UI 验收的"真组件"指 RN (`react-native-macos`) 真组件, 不是 vite web renderer. 5 路由 web renderer 是 Phase 6 T-6.1 Electron 桥接占位 (vite build 治本 = 149KB 稳定大小即视为 done, PM-FINAL-ACCEPT/05-09 5 PNG 验真). sub-agent 把 RN 模块读为"占位"会误派 T-7.5 类修 bug 任务, 实际无 bug 可修, 浪费 30min cap.

## fix Phase 7+

- 任何 "5 路由真组件" / "Pressable 占位" 误读必先跑 `grep -c "onPress" <file>` (> 0 = 真交互组件, ≠ 占位)
- 区分 RN 真组件 (`apps/desktop/src/modules/`) vs Web 简化占位 (`electron-shell/src/renderer.jsx`) — 两套独立渲染层
- 真要修 vite web renderer 5 路由占位, 改 `apps/desktop/electron-shell/src/renderer.jsx`, **不**改 `apps/desktop/src/router.tsx`
- 真要修 RN modules 5 路由屏, 改 `apps/desktop/src/screens/OutputScreen.tsx` (唯一个 RN 真占位), **不**改 modules (已真)
- 任务 spec 写 "Pressable → Fragment" 必 FAIL (React 语义不成立, 任何 worker 报 PASS 即默写没读代码)
- 与钉子 #48 (north_star v2 校对) 配对: T-7.0 gap-assessment sub-agent 报告必独立 `grep` / `ls -la` verify, 不信 self-report
