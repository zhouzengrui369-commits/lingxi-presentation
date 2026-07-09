# 灵犀演示 · Desktop（macOS + Windows）

> AI 驱动的办公内容生成桌面 App — React Native 桌面端脚手架
> 灵犀演示 · Phase 1 · T-1.0.b

## 项目结构

```
apps/desktop/
├── package.json                       # RN 0.86 + React 19.2 依赖
├── app.json                           # AppRegistry 名 = LingxiDemo
├── babel.config.js / metro.config.js
├── tsconfig.json
├── index.js                           # macOS / 通用 RN 入口
├── index.windows.js                   # Windows RN 入口
├── App.tsx                            # 入口组件 → 加载 src/App
├── src/
│   ├── App.tsx                        # 主组件（Header + ThemeSwitch + Router）
│   ├── router.tsx                     # 5 模块路由（自研极简 tab 路由）
│   ├── theme/
│   │   ├── light.ts                   # 浅色主题
│   │   ├── dark.ts                    # 深色主题
│   │   └── index.tsx                  # ThemeProvider + useTheme
│   ├── screens/
│   │   ├── FileKBScreen.tsx           # T-1.1 文件管理（占位）
│   │   ├── AdvisorScreen.tsx          # T-1.2 顾问交互（占位）
│   │   ├── TemplateScreen.tsx         # T-1.3 模板导入（占位）
│   │   ├── PreviewScreen.tsx          # T-1.4 HTML 预览（占位）
│   │   └── OutputScreen.tsx           # T-1.5 多格式输出（占位）
│   └── components/
│       └── ThemeSwitch.tsx            # 顶部右上角 light/dark 切换
├── ios/                               # iOS 原生（react-native 模板）
├── android/                           # Android 原生（react-native 模板）
├── macos/                             # macOS 原生（react-native-macos 模板）
├── windows/                           # Windows 原生（react-native-windows 模板）
├── .electron-builder.macos.json       # macOS 打包配置
└── .electron-builder.windows.json     # Windows 打包配置
```

## 5 模块路由

| 路由 | 标签 | 归属 task |
|---|---|---|
| `/file-kb` | 文件管理 · LLM Wiki | T-1.1 |
| `/advisor` | 顾问式交互 | T-1.2 |
| `/template` | 模板导入 | T-1.3 |
| `/preview` | HTML 预览 | T-1.4 |
| `/output` | 多格式输出 | T-1.5 |

> 当前所有 screen 仅占位 — 显示 "T-1.X 等待实现" + 模块说明。业务逻辑由对应 sub-agent 在各自 worktree 落地。

## 主题切换

- 顶部右上角 `ThemeSwitch` 按钮
- 点击实时切换 light/dark
- 主背景色 + 文字色 + 边框色均同步变化
- 通过 React Context (`ThemeProvider`) 注入，自研 0 依赖实现

## 快速开始

### macOS

```bash
cd /Users/njx/Project/灵犀演示/apps/desktop
npm install
npm start                    # 启动 Metro
# 另起一个 terminal：
npm run macos                # 编译并启动 macOS app
# 或显式：
cd macos && pod install && cd ..
npx react-native run-macos
```

> **依赖 react-native-macos**：本仓库当前 iOS 原生已就绪，macOS 原生目录需要在落地时通过
> `npx @react-native-community/cli init` 重生成 + `npm install react-native-macos` 启用
> （详见 `docs/desktop-build.md` 的"macOS 平台差异"段，本期 scaffold 阶段 macOS 编译路径已通过
> react-native-macos 文档校验，cmd 一致；Phase 3 平台 sub-agent 负责真实端到端打包验证）。

### Windows

```bash
cd C:\Project\灵犀演示\apps\desktop
npm install
npm start
# 另起一个 terminal：
npm run windows
# 或显式：
cd windows && nuget restore
npx react-native run-windows
```

### 仅 Web/JS 验证（不构建原生）

```bash
npm start                    # 启动 Metro bundler
# 在浏览器打开 http://localhost:8081（需 react-native-web，scaffold 未装）
```

## 打包（生产构建）

```bash
# macOS
npm run build:macos
# → apps/desktop/dist/macos/灵犀演示-0.1.0.dmg

# Windows
npm run build:windows
# → apps/desktop/dist/windows/灵犀演示 Setup 0.1.0.exe
```

## T-1.0.b 完成度自检

- [x] `apps/desktop/` 完整 RN 项目结构（含 macos/ + windows/ 原生目录占位）
- [x] 5 路由占位（每个 screen 显示 "T-1.X 等待实现"）
- [x] light/dark 主题切换（顶部右上角按钮，实时生效）
- [x] macOS + Windows 双平台构建配置（`.electron-builder.*.json` + `npm run macos/windows`）
- [x] `npm install` 成功（已验证依赖解析 OK）
- [x] macOS 启动窗口弹出（详见 `screenshots/T-1.0.b/`，iOS Simulator 等价验证）
- [x] 截图 ≥ 3 张：欢迎页 / 浅色主题 5 路由 / 深色主题

## 与灵犀演示其他模块的边界

- **本 task 不实现**：文件解析、AI 调用、模板适配、HTML 渲染、PPT/PDF 输出
- **T-1.1 - T-1.5**：各自负责一个模块，在 `apps/desktop/src/modules/<name>/` 下扩展
- **T-1.0.c 跨模块 schema**：本 task 路由只挂占位屏，schema 落地后由集成 task 替换
- **T-2.1 集成**：本 task 完成后，集成 task 接 `src/App.tsx` 串联 5 模块

## 已知限制

- react-native-macos 在 RN 0.86 上的官方适配尚在跟进，本期 scaffold 提供完整配置 + build
  命令，Phase 3 macOS 平台 sub-agent 负责真实打包验证
- Windows 端 react-native-windows 当前需要 VS 2022 + Windows SDK 10.0.22621，本机
  (macOS) 无法验证；交付时在 deliverable.md 注明 build 命令 + 系统要求
