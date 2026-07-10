/**
 * Electron main process — T-3.1 macOS 端到端 demo + 打包
 *
 * 灵犀演示 · Phase 3 · macOS 平台 shell
 * 集成 T-2.2 cli/full-demo.ts (main @ 6452840 已 100% PASS)
 *
 * 设计：极简 BrowserWindow + spawn Node child_process 跑现有 demo 脚本。
 * 不重新实现任何业务逻辑。
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Resolve runtime paths — packaged app has node_modules in Resources/lingxi-runtime
function resolveRuntimePaths() {
  const isDev = !app.isPackaged;
  let desktopDir;
  if (isDev) {
    // Dev mode: ../apps/desktop relative to this file
    desktopDir = path.resolve(__dirname, '..');
  } else {
    // Packaged: Resources/lingxi-runtime/apps/desktop
    desktopDir = path.join(process.resourcesPath, 'lingxi-runtime', 'apps', 'desktop');
  }
  return {
    desktopDir,
    repoRoot: path.resolve(desktopDir, '..', '..'),
    cliTs: path.join(desktopDir, 'cli', 'full-demo.ts'),
    nodeBin: process.execPath, // Electron's bundled node
    tsxBin: path.join(desktopDir, 'node_modules', '.bin', 'tsx'),
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: '灵犀演示',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Inline HTML with the demo UI
  win.loadFile(path.join(__dirname, 'renderer.html'));
  return win;
}

ipcMain.handle('start-demo', async (event) => {
  const paths = resolveRuntimePaths();
  const win = BrowserWindow.fromWebContents(event.sender);
  const log = (msg) => {
    if (win && !win.isDestroyed()) win.webContents.send('demo-log', msg);
  };

  log(`[setup] runtimeRoot=${paths.repoRoot}`);
  log(`[setup] cliTs=${paths.cliTs}`);
  log(`[setup] tsxBin=${paths.tsxBin}`);

  if (!fs.existsSync(paths.cliTs)) {
    log(`[FATAL] cli/full-demo.ts not found at ${paths.cliTs}`);
    return { ok: false, error: 'cli missing' };
  }
  if (!fs.existsSync(paths.tsxBin)) {
    log(`[FATAL] tsx not found at ${paths.tsxBin}`);
    return { ok: false, error: 'tsx missing' };
  }

  // Pick python: prefer system /usr/bin/python3 (has fastapi via pip --user)
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

  // Start daemon
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

  // Read daemon stdout: <pid>\n<port>\n
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

  // Run full demo
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
      env: { ...process.env, LINGXI_DAEMON_PORT: String(daemonPort), PATH: `${paths.desktopDir}/node_modules/.bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}` },
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
      // List output files
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
  const { shell } = require('electron');
  if (dir && fs.existsSync(dir)) shell.openPath(dir);
});

ipcMain.handle('show-in-finder', async (event, dir) => {
  const { shell } = require('electron');
  if (dir && fs.existsSync(dir)) shell.showItemInFolder(dir);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});