/**
 * Preload script — T-6.1 Electron ↔ RN renderer 桥接
 *
 * 灵犀演示 · Phase 6
 *
 * 通过 contextBridge 暴露 window.electronAPI 给 renderer (RN bundle),
 * 避免 renderer 直接 require('electron') (NodeIntegration 关闭时)。
 *
 * 暴露 API:
 *   - demoLog(line)            → renderer → main (推一条日志)
 *   - onDemoLog(cb)            → main → renderer (订阅 demo 日志)
 *   - startDemo()              → renderer → main (跑 full-demo)
 *   - openOutputDir(dir)       → renderer → main (Finder 打开)
 *   - platform / version       → renderer 启动期信息
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,

  // renderer → main
  demoLog: (line) => ipcRenderer.send('demo-log', line),
  startDemo: () => ipcRenderer.invoke('start-demo'),
  openOutputDir: (dir) => ipcRenderer.invoke('open-output-dir', dir),
  showInFinder: (dir) => ipcRenderer.invoke('show-in-finder', dir),
  setRoute: (routeKey) => ipcRenderer.invoke('set-route', routeKey),

  // main → renderer
  onDemoLog: (callback) => {
    const listener = (_event, line) => callback(line);
    ipcRenderer.on('demo-log', listener);
    return () => ipcRenderer.removeListener('demo-log', listener);
  },
});
