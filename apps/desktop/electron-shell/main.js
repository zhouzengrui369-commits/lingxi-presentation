/**
 * Electron main process — T-3.1 macOS 端到端 demo + 打包
 *                  — T-6.1 Electron BrowserWindow ↔ RN renderer 桥接
 *
 * 灵犀演示 · Phase 6
 *
 * 设计：极简 BrowserWindow + preload (contextBridge) + 5 路由 RN renderer bundle
 * Renderer bundle: apps/desktop/electron-shell/dist/renderer.bundle.js (vite build)
 * 桥接: webPreferences.contextIsolation = true + preload.js 暴露 window.electronAPI
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---- T-6.1: 路径解析 (含 renderer bundle 校验) ----
function resolveRuntimePaths() {
  const isDev = !app.isPackaged;
  let desktopDir;
  if (isDev) {
    desktopDir = path.resolve(__dirname, '..');
  } else {
    desktopDir = path.join(process.resourcesPath, 'lingxi-runtime', 'apps', 'desktop');
  }
  return {
    desktopDir,
    repoRoot: path.resolve(desktopDir, '..', '..'),
    cliTs: path.join(desktopDir, 'cli', 'full-demo.ts'),
    nodeBin: process.execPath,
    tsxBin: path.join(desktopDir, 'node_modules', '.bin', 'tsx'),
    rendererHtml: path.join(__dirname, 'renderer.html'),
    rendererBundle: path.join(__dirname, 'dist', 'renderer.bundle.js'),
    preloadScript: path.join(__dirname, 'preload.js'),
  };
}

let mainWindow = null; // T-6.1: 暴露给 IPC handler 拿主窗口

function createWindow() {
  const paths = resolveRuntimePaths();

  // ---- T-6.1: 校验 renderer bundle 存在 (vite build 没跑 → 友好提示)
  if (!fs.existsSync(paths.rendererBundle)) {
    console.warn(
      `[T-6.1] dist/renderer.bundle.js 不存在, 启动 BrowserWindow 将显示 5 路由占位。
       跑 \`cd apps/desktop/electron-shell && yarn build:renderer\` 生成 bundle。`,
    );
  } else {
    const stat = fs.statSync(paths.rendererBundle);
    console.log(`[T-6.1] renderer bundle OK: ${paths.rendererBundle} (${stat.size} bytes)`);
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    title: '灵犀演示',
    backgroundColor: '#ffffff',
    webPreferences: {
      // ---- T-6.1: 桥接配置 ----
      preload: paths.preloadScript, // preload.js 暴露 window.electronAPI
      contextIsolation: true, // 安全: 隔离 preload 和 renderer
      nodeIntegration: false, // 不让 renderer 直接 require('electron')
      sandbox: false, // 允许 preload 跑 require
    },
  });

  // T-6.1: 支持 --initial-route=<key> 命令行参数 (e.g. advisor, template)
  // 渲染初始路由, 方便多路由截图
  const initialRouteArg = process.argv.find((a) => a.startsWith('--initial-route='));
  const initialRoute = initialRouteArg ? initialRouteArg.split('=')[1] : '';
  if (initialRoute && ['file-kb', 'advisor', 'template', 'preview', 'output'].includes(initialRoute)) {
    mainWindow.loadFile(paths.rendererHtml, { hash: initialRoute });
  } else {
    mainWindow.loadFile(paths.rendererHtml);
  }
  return mainWindow;
}

// ---- T-6.1: renderer → main 的 demo-log 通道 ----
ipcMain.on('demo-log', (event, line) => {
  // renderer 主动推一条日志 (web 端测试用)
  if (mainWindow && !mainWindow.isDestroyed()) {
    // 当前窗口已订阅自己的 demo-log, 这里只回显到 main console
    console.log(`[renderer-log] ${line}`);
  }
});

// ---- T-6.1: 切换 route (供 main process / 测试用)
// 通过修改 URL hash 让 renderer 切换 tab, 然后 re-screenshot
ipcMain.handle('set-route', async (event, routeKey) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const paths = resolveRuntimePaths();
    const url = `file://${paths.rendererHtml}#${routeKey}`;
    await mainWindow.loadURL(url);
    return { ok: true, route: routeKey };
  }
  return { ok: false, error: 'no main window' };
});

// ---- T-3.1: 跑 full-demo (T-6.1 保留) ----
ipcMain.handle('start-demo', async (event) => {
  const paths = resolveRuntimePaths();
  const win = BrowserWindow.fromWebContents(event.sender);
  const log = (msg) => {
    if (win && !win.isDestroyed()) win.webContents.send('demo-log', msg);
  };

  log(`[setup] runtimeRoot=${paths.repoRoot}`);
  log(`[setup] cliTs=${paths.cliTs}`);

  if (!fs.existsSync(paths.cliTs)) {
    log(`[FATAL] cli/full-demo.ts not found at ${paths.cliTs}`);
    return { ok: false, error: 'cli missing' };
  }
  if (!fs.existsSync(paths.tsxBin)) {
    log(`[FATAL] tsx not found at ${paths.tsxBin}`);
    return { ok: false, error: 'tsx missing' };
  }

  const pyCandidates = [
    '/usr/bin/python3',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3',
  ];
  const pyBin = pyCandidates.find((p) => fs.existsSync(p));
  if (!pyBin) {
    log('[FATAL] no python3 binary found');
    return { ok: false, error: 'python missing' };
  }
  log(`[setup] python=${pyBin}`);

  log('[0/5] starting daemon...');
  const daemonEnv = {
    ...process.env,
    LINGXI_DAEMON_PORT: '0',
    PYTHONPATH: paths.repoRoot,
    PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}`,
  };
  const daemon = spawn(pyBin, ['-m', 'backend.daemon.server'], {
    cwd: paths.repoRoot,
    env: daemonEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let daemonBuf = '';
  let daemonPort = null;
  await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    daemon.stdout.on('data', (chunk) => {
      daemonBuf += chunk.toString();
      const lines = daemonBuf.split('\n');
      if (lines.length >= 2) {
        const p = parseInt(lines[1].trim(), 10);
        if (!isNaN(p) && p > 0) {
          daemonPort = p;
          clearTimeout(timer);
          resolve(p);
        }
      }
    });
    daemon.stderr.on('data', (chunk) => {
      const s = chunk.toString().trim();
      if (s) log(`[daemon] ${s}`);
    });
  });

  if (!daemonPort) {
    log('[FATAL] daemon failed to start (no port within 8s)');
    try { daemon.kill(); } catch (_) {}
    return { ok: false, error: 'daemon failed' };
  }
  log(`[0/5] daemon ready on port ${daemonPort}`);

  const outDir = path.join(os.tmpdir(), `lingxi-macos-demo-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const inputDir = path.join(paths.desktopDir, 'testdata', 'quarterly_review');

  log(`[1/5] file_kb: importing ${inputDir}...`);
  log(`[output] ${outDir}`);

  return new Promise((resolve) => {
    const proc = spawn(paths.tsxBin, [
      'cli/full-demo.ts',
      '--input', inputDir,
      '--output', outDir,
    ], {
      cwd: paths.desktopDir,
      env: {
        ...process.env,
        LINGXI_DAEMON_PORT: String(daemonPort),
        PATH: `${paths.desktopDir}/node_modules/.bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      s.split('\n').filter(Boolean).forEach((line) => log(line));
    });
    proc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      s.split('\n').filter(Boolean).forEach((line) => log(`[stderr] ${line}`));
    });
    proc.on('close', (code) => {
      try { daemon.kill(); } catch (_) {}
      const ok = code === 0;
      log(`DEMO ${ok ? '✓ 全程通过' : `失败 exit=${code}`}`);
      try {
        const files = fs.readdirSync(outDir).filter((f) => !f.startsWith('.'));
        for (const f of files) {
          const stat = fs.statSync(path.join(outDir, f));
          if (stat.isFile()) log(`[output] ${f} ${stat.size}B`);
        }
      } catch (_) {}
      resolve({ ok, outputDir: outDir, exitCode: code });
    });
  });
});

ipcMain.handle('open-output-dir', async (event, dir) => {
  if (dir && fs.existsSync(dir)) shell.openPath(dir);
});

ipcMain.handle('show-in-finder', async (event, dir) => {
  if (dir && fs.existsSync(dir)) shell.showItemInFolder(dir);
});

// ---- T-6.1: 暴露 Electron 版本信息给 renderer (用于 health check) ----
ipcMain.handle('get-info', async () => ({
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  pid: process.pid,
}));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
