/**
 * Preload script — T-6.1 Electron ↔ RN renderer 桥接
 * T-W1 (Wave 1 · ui_golden_path_agent): 5 模块业务 API 暴露
 *
 * 灵犀演示 · Phase 6 + Wave 1
 *
 * 通过 contextBridge 暴露 window.electronAPI 给 renderer (RN bundle),
 * 避免 renderer 直接 require('electron') (NodeIntegration 关闭时)。
 *
 * 暴露 API:
 *   - T-6.1 保留: demoLog / onDemoLog / startDemo / openOutputDir / setRoute / getInfo
 *   - T-W1 新增: 5 模块业务 API (fileKb / advisor / template / preview / output)
 *     + status API (getDaemonStatus / pingDaemon)
 *
 * 设计: renderer 不直接 fetch daemon, 而是通过 main 进程 IPC 转发, 这样:
 *   - request/result/error 状态可审计 (main process console.log 完整记录)
 *   - main 进程可注入 timeout/retry 逻辑
 *   - 统一错误处理 (404 / 5xx / timeout 都返回结构化 { ok, error, error_code })
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,

  // ---- T-6.1 保留 ----
  demoLog: (line) => ipcRenderer.send('demo-log', line),
  startDemo: () => ipcRenderer.invoke('start-demo'),
  openOutputDir: (dir) => ipcRenderer.invoke('open-output-dir', dir),
  showInFinder: (dir) => ipcRenderer.invoke('show-in-finder', dir),
  setRoute: (routeKey) => ipcRenderer.invoke('set-route', routeKey),
  getInfo: () => ipcRenderer.invoke('get-info'),

  // main → renderer
  onDemoLog: (callback) => {
    const listener = (_event, line) => callback(line);
    ipcRenderer.on('demo-log', listener);
    return () => ipcRenderer.removeListener('demo-log', listener);
  },

  // ---- T-W1 新增: 5 模块业务 API ----
  // 每个方法都通过 IPC 调到 main 进程, 由 main 进程 fetch daemon 端点
  // 返回统一格式: { ok: bool, data?: any, error?: string, error_code?: string, latency_ms?: number }
  fileKb: {
    import: (paths) => ipcRenderer.invoke('w1:fileKb:import', { paths }),
    list: () => ipcRenderer.invoke('w1:fileKb:list'),
    info: () => ipcRenderer.invoke('w1:fileKb:info'),
  },
  advisor: {
    chat: (prompt, options) => ipcRenderer.invoke('w1:advisor:chat', { prompt, options }),
    scenarios: () => ipcRenderer.invoke('w1:advisor:scenarios'),
  },
  template: {
    selectBuiltin: (builtin) => ipcRenderer.invoke('w1:template:selectBuiltin', { builtin }),
    selectImported: (inputPath) => ipcRenderer.invoke('w1:template:selectImported', { inputPath }),
  },
  preview: {
    generate: (prompt, styleId) => ipcRenderer.invoke('w1:preview:generate', { prompt, styleId }),
    load: (previewId) => ipcRenderer.invoke('w1:preview:load', { previewId }),
  },
  output: {
    generate: (format, htmlPath, outputPath) => ipcRenderer.invoke('w1:output:generate', { format, htmlPath, outputPath }),
    open: (filePath) => ipcRenderer.invoke('w1:output:open', { filePath }),
  },
  status: {
    getDaemon: () => ipcRenderer.invoke('w1:status:daemon'),
    ping: () => ipcRenderer.invoke('w1:status:ping'),
  },
  // T-W1: 内部 E2E 自动化 (screenshots + JS 执行) — main process 直接 capturePage / executeJavaScript
  // 不暴露给业务 UI, 仅供 T-W1 验证脚本用
  _internal: {
    capture: (outputPath) => ipcRenderer.invoke('w1:capture', { outputPath }),
    execute: (code) => ipcRenderer.invoke('w1:execute', { code }),
  },
});
