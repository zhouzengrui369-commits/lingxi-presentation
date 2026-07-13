/**
 * Electron preload — T-6.1 contextBridge
 *                  W2 (2026-07-13) — 5 业务模块 electronAPI + daemon health + set-route-navigate
 *
 * 暴露 window.electronAPI 给 renderer (contextIsolation: true)
 * 5 模块: fileKb / advisor / template / preview / output
 * + status (daemon health polling) + _internal (start-demo, set-route 等)
 */
const { contextBridge, ipcRenderer } = require('electron');

// T-6.1: 保留 startDemo 接口 (T-3.1 macOS demo)
contextBridge.exposeInMainWorld('electronAPI', {
  // 【T-3.1】保留
  startDemo: () => ipcRenderer.invoke('start-demo'),
  setRoute: (routeKey) => ipcRenderer.invoke('set-route', routeKey),
  // 【T-6.1】保留
  openOutputDir: (dir) => ipcRenderer.invoke('open-output-dir', dir),
  showInFinder: (dir) => ipcRenderer.invoke('show-in-finder', dir),
  onDemoLog: (cb) => {
    const listener = (_e, line) => cb(line);
    ipcRenderer.on('demo-log', listener);
    return () => ipcRenderer.removeListener('demo-log', listener);
  },
  getInfo: () => ipcRenderer.invoke('get-info'),

  // 【W2】新增 5 业务模块 — 每个 module 有 1-3 个 IPC
  fileKb: {
    list: () => ipcRenderer.invoke('w1:fileKb:list'),
    import: (paths) => ipcRenderer.invoke('w1:fileKb:import', { paths }),
  },
  advisor: {
    scenarios: () => ipcRenderer.invoke('w1:advisor:scenarios'),
    chat: (prompt) => ipcRenderer.invoke('w1:advisor:chat', { prompt }),
  },
  template: {
    selectBuiltin: (builtin) => ipcRenderer.invoke('w1:template:selectBuiltin', { builtin }),
  },
  preview: {
    generate: (prompt, stylePath) => ipcRenderer.invoke('w1:preview:generate', { prompt, style_path: stylePath }),
    load: (id) => ipcRenderer.invoke('w1:preview:load', { id }),
  },
  output: {
    generate: (format, htmlPath, outputPath) => ipcRenderer.invoke('w1:output:generate', { format, html_path: htmlPath, output_path: outputPath }),
  },

  // 【W2】status — daemon health polling
  status: {
    daemonHealth: () => ipcRenderer.invoke('daemon:health'),
  },

  // 【W2】_internal — 测试 / 调试用
  _internal: {
    setRouteNavigate: (key) => ipcRenderer.invoke('set-route-navigate', key),
  },
});
