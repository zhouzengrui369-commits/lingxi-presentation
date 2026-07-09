# macOS 原生目录占位

> 灵犀演示 · Phase 1 · T-1.0.b · macOS 桌面端

## 当前状态

本目录在 T-1.0.b 阶段为 **占位**。完整 macOS 原生工程（Xcode project、Podfile、AppDelegate 等）
需通过 `react-native-macos` 模板落地。

## 落地方式（Phase 3 sub-agent 执行）

```bash
# 在独立 worktree 中（如 wt-macos）
cd /Users/njx/Project/wt-frontend-scaffold/apps/desktop
npm install --save-dev react-native-macos@latest
npx react-native-macos@latest init LingxiDemoMac \
  --template-path node_modules/react-native-macos/template \
  --skip-install
# 把生成的 macos/ 内容覆盖到本目录
# 修改 Podfile / AppDelegate / Info.plist 适配项目
cd macos && pod install
```

## Build 命令

```bash
npm run macos
# 或
npx react-native run-macos
```

## 配置要点

- Bundle ID: `com.lingxi.desktop`
- Min macOS: 11.0 (Big Sur)
- 架构: x86_64 + arm64 (universal)
- 打包: `npm run build:macos` → `dist/macos/灵犀演示-0.1.0.dmg`

## 路径

- macOS 知识库：`~/Library/Application Support/灵犀演示/kb/`
- 配置文件：`~/Library/Application Support/灵犀演示/config.json`
