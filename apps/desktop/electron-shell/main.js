/**
 * Electron main process — T-3.1 macOS 端到端 demo + 打包
 *                  — T-6.1 Electron BrowserWindow ↔ RN renderer 桥接
 *                  — T-W1 (Wave 1) UI 黄金路径接通
 *
 * 灵犀演示 · Phase 6 + Wave 1
 *
 * 设计:
 *   1. app.whenReady 后**自动启动 daemon 一次** (T-W1), 把 port 缓存到 module-level
 *   2. 5 模块 IPC handlers 通过 fetch 调 daemon 端点 (/v1/import /v1/templates /v1/preview /v1/output /v1/chat)
 *   3. renderer 通过 window.electronAPI 调这些 IPC
 *   4. 每个 IPC 调用都加 console.log 审计 (request/result/error) — 钉子 #9 + §3.2
 *   5. daemon 不可达 → IPC 返回 { ok: false, error: 'daemon_unreachable', error_code: 'E_DAEMON' }
 *   6. 保留 T-3.1 start-demo (旧路径) + T-6.1 5 路由占位 (renderer 替换为真业务组件)
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
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

// ---- T-W1: daemon 状态 ----
let w1Daemon = {
  proc: null,        // child process
  port: null,        // port number
  baseUrl: null,     // http://127.0.0.1:port
  startedAt: null,   // ISO string
  lastError: null,   // last error message
  ready: false,      // bool
};

function logW1(line) {
  // main console + IPC 推给 renderer log panel
  console.log(`[w1] ${line}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('demo-log', `[w1] ${line}`);
  }
}

async function startW1Daemon() {
  if (w1Daemon.proc) {
    logW1(`daemon already started on port ${w1Daemon.port}`);
    return w1Daemon;
  }
  const paths = resolveRuntimePaths();
  const pyCandidates = [
    '/Users/njx/Project/灵犀演示/.venv-daemon-py312/bin/python3.12',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3',
    '/usr/bin/python3',
  ];
  const pyBin = pyCandidates.find((p) => fs.existsSync(p));
  if (!pyBin) {
    const err = `no python3 binary found in ${pyCandidates.join(', ')}`;
    logW1(`[FATAL] ${err}`);
    w1Daemon.lastError = err;
    return w1Daemon;
  }
  logW1(`[setup] python=${pyBin}`);
  const env = {
    ...process.env,
    LINGXI_DAEMON_PORT: '0',
    PYTHONPATH: paths.repoRoot,
    PATH: `${paths.desktopDir}/node_modules/.bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}`,
  };
  logW1(`[0/5] starting daemon...`);
  const proc = spawn(pyBin, ['-m', 'backend.daemon.server'], {
    cwd: paths.repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  w1Daemon.proc = proc;

  let buf = '';
  let port = null;
  await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10000);
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      // PID + PORT 头两行
      if (lines.length >= 2) {
        const p = parseInt(lines[1].trim(), 10);
        if (!isNaN(p) && p > 0) {
          port = p;
          clearTimeout(timer);
          resolve(p);
        }
      }
    });
    proc.stderr.on('data', (chunk) => {
      const s = chunk.toString().trim();
      if (s) logW1(`[daemon] ${s}`);
    });
    proc.on('close', (code) => {
      logW1(`[daemon] process exited code=${code}`);
      w1Daemon.lastError = `daemon exited code=${code}`;
      w1Daemon.ready = false;
    });
  });

  if (!port) {
    logW1('[FATAL] daemon failed to start (no port within 10s)');
    try { proc.kill(); } catch (_) {}
    w1Daemon.proc = null;
    w1Daemon.lastError = 'daemon_failed_to_start';
    return w1Daemon;
  }
  w1Daemon.port = port;
  w1Daemon.baseUrl = `http://127.0.0.1:${port}`;
  w1Daemon.startedAt = new Date().toISOString();
  w1Daemon.ready = true;
  logW1(`[0/5] daemon ready on port ${port} (baseUrl=${w1Daemon.baseUrl})`);
  return w1Daemon;
}

async function stopW1Daemon() {
  if (w1Daemon.proc) {
    try {
      w1Daemon.proc.kill();
    } catch (_) {}
    w1Daemon.proc = null;
    w1Daemon.ready = false;
    w1Daemon.port = null;
  }
}

// ---- T-W1: daemon fetch helper ----
// 统一的 fetch wrapper: 8s timeout + JSON parse + 错误归一化
async function w1FetchJson(method, path, body) {
  if (!w1Daemon.ready) {
    return { ok: false, error: 'daemon_not_ready', error_code: 'E_DAEMON_NOT_READY', last_error: w1Daemon.lastError };
  }
  const url = `${w1Daemon.baseUrl}${path}`;
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);  // 30s timeout (大 import/preview 可能慢)
  try {
    const r = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    clearTimeout(timer);
    const elapsed_ms = Date.now() - started;
    if (!r.ok) {
      let errBody = '';
      try { errBody = await r.text(); } catch (_) {}
      logW1(`[fetch] ${method} ${path} → HTTP ${r.status} (${elapsed_ms}ms) errBody=${errBody.slice(0, 200)}`);
      return { ok: false, error: `http_${r.status}`, error_code: `E_HTTP_${r.status}`, latency_ms: elapsed_ms, http_status: r.status, err_body: errBody.slice(0, 500) };
    }
    const data = await r.json();
    logW1(`[fetch] ${method} ${path} → 200 (${elapsed_ms}ms) data_keys=${Object.keys(data).slice(0, 5).join(',')}`);
    return { ok: true, data, latency_ms: elapsed_ms };
  } catch (e) {
    clearTimeout(timer);
    const elapsed_ms = Date.now() - started;
    if (e.name === 'AbortError') {
      logW1(`[fetch] ${method} ${path} → TIMEOUT (${elapsed_ms}ms)`);
      return { ok: false, error: 'timeout', error_code: 'E_TIMEOUT', latency_ms: elapsed_ms };
    }
    logW1(`[fetch] ${method} ${path} → ERROR ${e.message} (${elapsed_ms}ms)`);
    return { ok: false, error: e.message, error_code: 'E_FETCH', latency_ms: elapsed_ms };
  }
}

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
      preload: paths.preloadScript,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // T-6.1: 支持 --initial-route=<key> 命令行参数
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log(`[renderer-log] ${line}`);
  }
});

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
ipcMain.handle('get-info', async () => ({
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  pid: process.pid,
}));

// =================================================================
// T-W1: 5 模块业务 IPC handlers (UI 黄金路径接通)
// =================================================================

// ---- file-kb ----
ipcMain.handle('w1:fileKb:import', async (event, { paths }) => {
  logW1(`[w1:fileKb:import] paths=${JSON.stringify(paths)}`);
  return await w1FetchJson('POST', '/v1/import', { paths });
});

ipcMain.handle('w1:fileKb:list', async (event) => {
  logW1(`[w1:fileKb:list]`);
  // /v1/import 实际上是导入+返回, 我们没有 list 端点, 用 import 一次 paths=空
  // 兜底: 从 KB 根读 index.json
  // 实际: 调用 /v1/import 配合 paths=[] 不行, 我们直接 read KB 根 index.json
  const paths = resolveRuntimePaths();
  const home = os.homedir();
  const kbRoot = path.join(home, 'Library', 'Application Support', '灵犀演示', 'kb');
  if (!fs.existsSync(kbRoot)) {
    return { ok: true, data: { files: [], entries: [], kb_root: kbRoot, manifest: null }, latency_ms: 0 };
  }
  try {
    const indexPath = path.join(kbRoot, 'index.json');
    const manifestPath = path.join(kbRoot, 'manifest.json');
    const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf-8')) : { files: [], entries: [] };
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : null;
    return { ok: true, data: { files: index.files, entries: index.entries, kb_root: kbRoot, manifest }, latency_ms: 0 };
  } catch (e) {
    return { ok: false, error: e.message, error_code: 'E_READ_KB' };
  }
});

ipcMain.handle('w1:fileKb:info', async (event) => {
  const home = os.homedir();
  const kbRoot = path.join(home, 'Library', 'Application Support', '灵犀演示', 'kb');
  return {
    ok: true,
    data: {
      kb_root: kbRoot,
      exists: fs.existsSync(kbRoot),
    },
  };
});

// ---- advisor ----
ipcMain.handle('w1:advisor:chat', async (event, { prompt, options }) => {
  logW1(`[w1:advisor:chat] prompt=${JSON.stringify(prompt).slice(0, 80)}...`);
  return await w1FetchJson('POST', '/v1/chat', { prompt, ...(options || {}) });
});

ipcMain.handle('w1:advisor:scenarios', async (event) => {
  // 静态返回 (写死 4 个场景供 UI 选)
  return {
    ok: true,
    data: {
      scenarios: [
        { id: 'quarterly_review', label: '季度汇报', description: '生成本季度业绩、进展、计划汇报' },
        { id: 'product_launch', label: '产品发布', description: '为新产品发布准备完整介绍文档' },
        { id: 'team_weekly', label: '团队周报', description: '本周团队工作内容、问题、计划' },
        { id: 'client_proposal', label: '客户提案', description: '为潜在客户准备商业提案' },
      ],
    },
  };
});

// ---- template ----
ipcMain.handle('w1:template:selectBuiltin', async (event, { builtin }) => {
  logW1(`[w1:template:selectBuiltin] builtin=${builtin}`);
  return await w1FetchJson('POST', '/v1/templates', { builtin });
});

ipcMain.handle('w1:template:selectImported', async (event, { inputPath }) => {
  logW1(`[w1:template:selectImported] inputPath=${inputPath}`);
  return await w1FetchJson('POST', '/v1/templates', { input_path: inputPath });
});

// ---- preview ----
ipcMain.handle('w1:preview:generate', async (event, { prompt, styleId }) => {
  logW1(`[w1:preview:generate] prompt=${JSON.stringify(prompt).slice(0, 80)}... style_id=${styleId || '(default)'}`);
  return await w1FetchJson('POST', '/v1/preview', { prompt, style_id: styleId });
});

ipcMain.handle('w1:preview:load', async (event, { previewId }) => {
  // previewId='latest' 找 /tmp/lingxi_preview_* 下最新 .html
  if (previewId === 'latest' || !previewId) {
    try {
      const tmpDirs = fs.readdirSync('/tmp').filter((d) => d.startsWith('lingxi_preview_'));
      let latestFile = null;
      let latestMtime = 0;
      for (const d of tmpDirs) {
        const dirPath = path.join('/tmp', d);
        if (!fs.statSync(dirPath).isDirectory()) continue;
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.html'));
        for (const f of files) {
          const fp = path.join(dirPath, f);
          const stat = fs.statSync(fp);
          if (stat.mtimeMs > latestMtime) {
            latestMtime = stat.mtimeMs;
            latestFile = { path: fp, mtime: stat.mtimeMs };
          }
        }
      }
      if (latestFile) {
        const html = fs.readFileSync(latestFile.path, 'utf-8');
        logW1(`[w1:preview:load] latest = ${latestFile.path}`);
        return { ok: true, data: { preview_id: path.basename(latestFile.path, '.html'), html, html_path: latestFile.path } };
      }
      return { ok: false, error: 'no_preview_found', error_code: 'E_NO_PREVIEW' };
    } catch (e) {
      return { ok: false, error: e.message, error_code: 'E_FIND_PREVIEW' };
    }
  }
  // 具体 previewId
  const tmpDirs = fs.readdirSync('/tmp').filter((d) => d.startsWith('lingxi_preview_'));
  for (const d of tmpDirs) {
    const htmlPath = path.join('/tmp', d, `${previewId}.html`);
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      return { ok: true, data: { preview_id: previewId, html, html_path: htmlPath } };
    }
  }
  return { ok: false, error: 'preview_not_found', error_code: 'E_PREVIEW_NOT_FOUND' };
});

// ---- output ----
ipcMain.handle('w1:output:generate', async (event, { format, htmlPath, outputPath }) => {
  logW1(`[w1:output:generate] format=${format} html=${htmlPath} output=${outputPath}`);
  return await w1FetchJson('POST', '/v1/output', { html_path: htmlPath, format, output_path: outputPath });
});

ipcMain.handle('w1:output:open', async (event, { filePath }) => {
  logW1(`[w1:output:open] filePath=${filePath}`);
  if (filePath && fs.existsSync(filePath)) {
    shell.openPath(filePath);
    return { ok: true };
  }
  return { ok: false, error: 'file_not_found' };
});

// ---- status ----
ipcMain.handle('w1:status:daemon', async (event) => {
  return {
    ok: true,
    data: {
      ready: w1Daemon.ready,
      port: w1Daemon.port,
      base_url: w1Daemon.baseUrl,
      started_at: w1Daemon.startedAt,
      last_error: w1Daemon.lastError,
      pid: w1Daemon.proc ? w1Daemon.proc.pid : null,
    },
  };
});

ipcMain.handle('w1:status:ping', async (event) => {
  if (!w1Daemon.ready) {
    return { ok: false, error: 'daemon_not_ready', error_code: 'E_DAEMON_NOT_READY' };
  }
  return await w1FetchJson('GET', '/v1/health');
});

// ---- T-W1: capture BrowserWindow (for E2E screenshots) ----
// 钉子: 必须用 webContents.capturePage() 而不是 screencapture (no screen permission)
ipcMain.handle('w1:capture', async (event, { outputPath }) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'no_main_window', error_code: 'E_NO_WINDOW' };
  }
  try {
    const image = await mainWindow.webContents.capturePage();
    if (!outputPath) {
      return { ok: true, data: { size: image.getSize(), buffer_size: image.toPNG().length } };
    }
    const fs_write_result = require('fs').writeFileSync(outputPath, image.toPNG());
    const stat = require('fs').statSync(outputPath);
    logW1(`[w1:capture] wrote ${outputPath} (${stat.size} bytes, ${image.getSize().width}x${image.getSize().height})`);
    return { ok: true, data: { path: outputPath, size: stat.size, dimensions: image.getSize() } };
  } catch (e) {
    logW1(`[w1:capture] failed: ${e.message}`);
    return { ok: false, error: e.message, error_code: 'E_CAPTURE' };
  }
});

// ---- T-W1: execute JavaScript in renderer (for E2E automation) ----
ipcMain.handle('w1:execute', async (event, { code }) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'no_main_window', error_code: 'E_NO_WINDOW' };
  }
  try {
    const result = await mainWindow.webContents.executeJavaScript(code, true);
    return { ok: true, data: { result } };
  } catch (e) {
    logW1(`[w1:execute] failed: ${e.message}`);
    return { ok: false, error: e.message, error_code: 'E_EXECUTE' };
  }
});

// =================================================================
// 启动 + 收尾
// =================================================================

// ---- T-W1: E2E 自动化 (--w1-e2e=<output_dir>) ----
// 启动后自动跑 5 路由 + 触发业务 + 截图, 然后退出
async function runW1E2E(outputDir) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    logW1('[e2e] no main window');
    return;
  }
  logW1(`[e2e] starting E2E sequence, outputDir=${outputDir}`);

  // 等待 renderer ready (15s timeout)
  await new Promise((resolve) => {
    let waited = 0;
    const tick = () => {
      if (mainWindow.webContents.isLoading()) {
        if (waited < 15000) {
          waited += 200;
          setTimeout(tick, 200);
        } else resolve();
      } else resolve();
    };
    tick();
  });
  await new Promise((r) => setTimeout(r, 2000));  // 等 React 渲染

  const steps = [
    {
      name: '01_file_kb_route',
      setup: "window.location.hash = 'file-kb';",
      action: null,  // 只截当前路由
      wait_ms: 1500,
    },
    {
      name: '02_file_kb_imported',
      setup: "window.location.hash = 'file-kb';",
      action: `
        document.querySelector('[data-testid=\"btn-import-default\"]').click();
      `,
      wait_ms: 4000,  // 等待 import 跑完
    },
    {
      name: '03_advisor_scenario',
      setup: "window.location.hash = 'advisor';",
      action: null,
      wait_ms: 1500,
    },
    {
      name: '04_advisor_q1_options',
      setup: "window.location.hash = 'advisor';",
      action: `
        const card = document.querySelector('[data-testid=\"scenario-quarterly_review\"]');
        if (card) card.click();
      `,
      wait_ms: 1500,
    },
    {
      name: '05_advisor_q2_options',
      setup: "window.location.hash = 'advisor';",
      action: `
        // 已经在第 1 轮 (step 04), 直接选 opt-leadership 进第 2 轮
        const opt = document.querySelector('[data-testid=\"opt-leadership\"]');
        if (opt) opt.click();
      `,
      wait_ms: 1500,
    },
    {
      name: '06_template_3_sets',
      setup: "window.location.hash = 'template';",
      action: null,
      wait_ms: 1500,
    },
    {
      name: '07_template_dark_selected',
      setup: "window.location.hash = 'template';",
      action: `
        const tpl = document.querySelector('[data-testid=\"template-builtin_business_dark\"]');
        if (tpl) tpl.click();
      `,
      wait_ms: 3000,
    },
    {
      name: '08_preview_generated',
      setup: "window.location.hash = 'preview';",
      action: `
        document.querySelector('[data-testid=\"btn-generate-preview\"]').click();
      `,
      wait_ms: 5000,  // preview generation 通常 1-3s
    },
    {
      name: '09_output_4formats',
      setup: "window.location.hash = 'output';",
      action: null,
      wait_ms: 3000,  // 等 React 渲染 output 路由
    },
    {
      name: '10_output_pptx_generated',
      setup: "window.location.hash = 'output';",
      action: `
        const btn = document.querySelector('[data-testid=\"format-pptx\"]');
        if (btn) btn.click();
      `,
      wait_ms: 8000,  // findLatestPreview + export
    },
  ];

  for (const step of steps) {
    logW1(`[e2e] step ${step.name} starting`);
    try {
      if (step.setup) {
        logW1(`[e2e] step ${step.name} setup: ${step.setup.slice(0, 80)}`);
        // 改用 set-route IPC 强制切换 (避免 hashchange listener 闭包问题)
        if (step.setup.includes("window.location.hash = '")) {
          const m = step.setup.match(/window\.location\.hash = '([^']+)'/);
          if (m) {
            await mainWindow.webContents.executeJavaScript(
              `if (window.__lingxiDemo && window.__lingxiDemo.setRoute) { window.__lingxiDemo.setRoute('${m[1]}'); }`,
              true,
            );
          } else {
            await mainWindow.webContents.executeJavaScript(step.setup, true);
          }
        } else {
          await mainWindow.webContents.executeJavaScript(step.setup, true);
        }
        await new Promise((r) => setTimeout(r, 1000));  // 等路由切换
      }
      if (step.action) {
        logW1(`[e2e] step ${step.name} action: ${step.action.slice(0, 80)}`);
        await mainWindow.webContents.executeJavaScript(step.action, true);
      }
      await new Promise((r) => setTimeout(r, step.wait_ms || 1500));
      if (step.followup) {
        logW1(`[e2e] step ${step.name} followup: ${step.followup.slice(0, 80)}`);
        await mainWindow.webContents.executeJavaScript(step.followup, true);
        await new Promise((r) => setTimeout(r, step.followup_wait_ms || 1500));
      }
      // 截图 (先等 React render 完成, 再 capturePage)
      // React 18 concurrent mode 下 setState 是异步的, 给 1.5s 让 React 充分 re-render
      await new Promise((r) => setTimeout(r, 1500));
      // 强制刷新 layout (避免 GPU 缓存 stale frame)
      try {
        await mainWindow.webContents.executeJavaScript(
          'document.body.offsetHeight; new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));',
          true,
        );
      } catch (_) {}
      const img = await mainWindow.webContents.capturePage();
      const outPath = require('path').join(outputDir, `${step.name}.png`);
      require('fs').writeFileSync(outPath, img.toPNG());
      const stat = require('fs').statSync(outPath);
      logW1(`[e2e] step ${step.name} done → ${outPath} (${stat.size} bytes, ${img.getSize().width}x${img.getSize().height})`);
    } catch (e) {
      logW1(`[e2e] step ${step.name} FAILED: ${e.message}`);
      // 仍然截图
      try {
        const img = await mainWindow.webContents.capturePage();
        const outPath = require('path').join(outputDir, `${step.name}.png`);
        require('fs').writeFileSync(outPath, img.toPNG());
        logW1(`[e2e] step ${step.name} FAILED screenshot saved`);
      } catch (_) {}
    }
  }
  logW1(`[e2e] all steps done, exiting`);
  setTimeout(() => app.quit(), 2000);
}

app.whenReady().then(async () => {
  // T-W1: app ready 后立刻启动 daemon
  try {
    await startW1Daemon();
  } catch (e) {
    logW1(`[FATAL] startW1Daemon failed: ${e.message}`);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // T-W1: --w1-e2e=<output_dir> 模式: 自动跑 E2E + 截图后退出
  const e2eArg = process.argv.find((a) => a.startsWith('--w1-e2e='));
  if (e2eArg) {
    const outputDir = e2eArg.split('=')[1];
    try {
      await runW1E2E(outputDir);
    } catch (e) {
      logW1(`[e2e] fatal: ${e.message}`);
      setTimeout(() => app.quit(), 2000);
    }
  }
});

app.on('before-quit', async () => {
  await stopW1Daemon();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopW1Daemon();
    app.quit();
  }
});
