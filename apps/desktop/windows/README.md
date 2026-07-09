# Windows 原生目录占位

> 灵犀演示 · Phase 1 · T-1.0.b · Windows 桌面端

## 当前状态

本目录在 T-1.0.b 阶段为 **占位**。完整 Windows 原生工程（Visual Studio solution、App.cs、
Package.appxmanifest 等）需通过 `react-native-windows` 模板落地。

## 系统要求

- Windows 11 64-bit
- Visual Studio 2022 (含 "Universal Windows Platform development" + "Desktop development with C++")
- Windows 10 SDK 10.0.22621
- Node.js >= 22.11
- .NET 6 SDK

## 落地方式（Phase 3 sub-agent 执行）

```powershell
# 在独立 worktree 中（如 wt-windows）
cd C:\Project\灵犀演示\apps\desktop
npm install --save-dev react-native-windows@latest
npx react-native-windows-init --overwrite
# 生成的 windows/ 内容覆盖到本目录
```

## Build 命令

```powershell
npm run windows
# 或
npx react-native run-windows
```

## 打包

```powershell
npm run build:windows
# → dist\windows\灵犀演示 Setup 0.1.0.exe
```

## 路径

- Windows 知识库：`%APPDATA%\灵犀演示\kb\`
- 配置文件：`%APPDATA%\灵犀演示\config.json`
