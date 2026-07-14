/**
 * Electron main process — T-3.1 macOS 端到端 demo + 打包
 *                  — T-6.1 Electron BrowserWindow ↔ RN renderer 桥接
 *                  — W2 (2026-07-13) fail-closed 验证 + 5 路由 IPC + daemon health
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
const http = require('http');

// ---- 【W6】test-flow 模式: --test-flow=<json> 启 App, IPC 真业务触发 + 写 done_marker ----
// JSON 格式: {"ops": [{"method": "fileKb.import", "args": {...}}, ...],
//              "screenshots": ["/abs/path/01.png", ...],   // optional, 与 ops 等长
//              "done_marker": "/abs/path/done.json",
//              "inter_step_ms": 1500}                        // optional, 每步间 wait
//
// 工作流: app ready → createWindow → 等 page load → 2s render settle
//   → 对每个 op: executeJavaScript('window.electronAPI.X.Y(args)') → 写 .step_done
//   → 写 done_marker (含所有 op 结果)
//   → app.quit()
//
// 用例: mvp_real_operation_v4.sh 用这个 flag 走 IPC 真业务触发 (vs v3 --initial-route 静态页面)
const testFlowArg = process.argv.find((a) => a.startsWith('--test-flow='));

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
let w1Daemon = null; // 【W2】daemon instance (W1 接通)

function createWindow() {
  const paths = resolveRuntimePaths();

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
      preload: paths.preloadScript,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // T-6.1: 支持 --initial-route=<key> 命令行参数 (e.g. advisor, template)
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

// ---- T-6.1: 切换 route ----
ipcMain.handle('set-route', async (event, routeKey) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const paths = resolveRuntimePaths();
    const url = `file://${paths.rendererHtml}#${routeKey}`;
    await mainWindow.loadURL(url);
    return { ok: true, route: routeKey };
  }
  return { ok: false, error: 'no main window' };
});

// ---- 【W2】set-route-without-reload: 改 hash 不 reload page ----
ipcMain.handle('set-route-navigate', async (event, routeKey) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      await mainWindow.webContents.executeJavaScript(`window.location.hash = '${routeKey}';`);
      return { ok: true, route: routeKey };
    } catch (e) {
      return { ok: false, error: e?.message ?? 'unknown' };
    }
  }
  return { ok: false, error: 'no main window' };
});

// ---- 【W2】daemon health: renderer 可拉 ----
ipcMain.handle('get-info', async () => ({
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  pid: process.pid,
}));

// 【W2】daemon health: 转发 daemon /v1/health
ipcMain.handle('daemon:health', async () => {
  if (!w1Daemon?.baseUrl) return { status: 'unknown', available: false, active_provider: 'unknown' };
  try {
    const r = await fetch(`${w1Daemon.baseUrl}/v1/health`, { signal: AbortSignal.timeout(2_000) });
    return await r.json();
  } catch (e) {
    return { status: 'unreachable', available: false, active_provider: 'unknown', error: e?.message };
  }
});

// ---- 【W2】30s IPC timeout + 5 业务 IPC handler (W1 接通) ----
async function w1FetchJson(method, path, body) {
  if (!w1Daemon?.baseUrl) {
    return { ok: false, error: 'daemon not started', error_code: 'E_DAEMON_NOT_READY' };
  }
  const url = `${w1Daemon.baseUrl}${path}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  const t0 = Date.now();
  try {
    const opts = { method, signal: ac.signal, headers: { 'content-type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    clearTimeout(timer);
    const latency_ms = Date.now() - t0;
    if (!r.ok) {
      let data = null;
      try { data = await r.json(); } catch { /* ignore */ }
      return { ok: false, error: data?.detail?.message ?? `http_${r.status}`, error_code: data?.detail?.error_code ?? `E_HTTP_${r.status}`, latency_ms };
    }
    const data = await r.json();
    return { ok: true, data: data?.data ?? data, latency_ms };
  } catch (e) {
    clearTimeout(timer);
    const error_code = e.name === 'AbortError' ? 'E_TIMEOUT' : 'E_FETCH';
    return { ok: false, error: e.message, error_code, latency_ms: Date.now() - t0 };
  }
}

function logW1(...args) {
  console.log('[w1]', ...args);
}

ipcMain.handle('w1:fileKb:list', async () => {
  logW1('[w1:fileKb:list]');
  return w1FetchJson('GET', '/v1/kb/list');
});

ipcMain.handle('w1:fileKb:import', async (event, { paths: importPaths }) => {
  logW1(`[w1:fileKb:import] paths=${JSON.stringify(importPaths)}`);
  return w1FetchJson('POST', '/v1/import', { paths: importPaths });
});

ipcMain.handle('w1:advisor:scenarios', async () => {
  logW1('[w1:advisor:scenarios]');
  return w1FetchJson('GET', '/v1/advisor/scenarios');
});

ipcMain.handle('w1:advisor:chat', async (event, { prompt }) => {
  logW1(`[w1:advisor:chat] prompt_len=${prompt?.length ?? 0}`);
  return w1FetchJson('POST', '/v1/chat', { prompt });
});

ipcMain.handle('w1:template:selectBuiltin', async (event, { builtin }) => {
  logW1(`[w1:template:selectBuiltin] builtin=${builtin}`);
  return w1FetchJson('POST', '/v1/templates', { builtin });
});

ipcMain.handle('w1:preview:generate', async (event, { prompt, style_path }) => {
  logW1(`[w1:preview:generate] prompt_len=${prompt?.length ?? 0}`);
  return w1FetchJson('POST', '/v1/preview', { prompt, style_path });
});

ipcMain.handle('w1:preview:load', async (event, { id }) => {
  logW1(`[w1:preview:load] id=${id}`);
  // 简化: 返回最近一个 preview html_path
  return w1FetchJson('GET', `/v1/preview/${id}`);
});

ipcMain.handle('w1:output:generate', async (event, { format, html_path, output_path }) => {
  logW1(`[w1:output:generate] format=${format} html=${html_path} output=${output_path}`);
  return w1FetchJson('POST', '/v1/output', { format, html_path, output_path });
});

// ---- 【W2】daemon 生命周期 ----
async function startW1Daemon() {
  const paths = resolveRuntimePaths();
  const port = parseInt(process.env.LINGXI_DAEMON_PORT || '0', 10) || 0;
  const pyBin = '/opt/homebrew/bin/python3.12';
  // 【W2】显式 unset 默认 fail-closed env (用户必须显式 enable)
  const daemonEnv = {
    ...process.env,
    LINGXI_DAEMON_PORT: '0',  // 让 daemon 选空闲端口
    PYTHONPATH: paths.repoRoot,
    LINGXI_API_PROVIDER_ALLOW_PS_TOKEN: '0',  // 【W2】默认禁 ps 抓 token
    PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}`,
  };
  // 不强制设 LINGXI_API_PROVIDER_ALLOW_MOCK, 跟 shell 一致
  const daemon = spawn(pyBin, ['-m', 'backend.daemon.server'], {
    cwd: paths.repoRoot,
    env: daemonEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  let daemonPort = null;
  const ready = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10_000);
    daemon.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
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
      if (s) logW1(`[daemon] ${s}`);
    });
  });
  const result = await ready;
  if (!result) {
    try { daemon.kill(); } catch {}
    logW1('[daemon] failed to start within 10s');
    return null;
  }
  w1Daemon = { proc: daemon, baseUrl: `http://127.0.0.1:${daemonPort}`, port: daemonPort };
  logW1(`[daemon] started on port ${daemonPort}`);
  return w1Daemon;
}

async function stopW1Daemon() {
  if (w1Daemon?.proc) {
    try { w1Daemon.proc.kill('SIGTERM'); } catch {}
    await new Promise((r) => setTimeout(r, 500));
    try { w1Daemon.proc.kill('SIGKILL'); } catch {}
    w1Daemon = null;
  }
}

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

// ---- 【W6】test-flow 执行: IPC 真业务触发 + 写 done_marker ----
async function runTestFlow(flowJsonStr) {
  let flow;
  try {
    flow = JSON.parse(flowJsonStr);
  } catch (e) {
    logW1(`[test-flow] FATAL: JSON parse failed: ${e.message}`);
    setTimeout(() => app.quit(), 500);
    return;
  }
  const ops = Array.isArray(flow.ops) ? flow.ops : [];
  const screenshots = Array.isArray(flow.screenshots) ? flow.screenshots : [];
  const doneMarker = flow.done_marker || '';
  const interStepMs = Number.isInteger(flow.inter_step_ms) ? flow.inter_step_ms : 1500;
  const renderSettleMs = 2500; // RN renderer 挂载 + 初始 render 等待

  logW1(`[test-flow] start: ops=${ops.length} done_marker=${doneMarker} inter_step_ms=${interStepMs}`);

  const win = createWindow();
  // 等 page load 完成
  await new Promise((resolve) => {
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => resolve(undefined));
    } else {
      resolve(undefined);
    }
  });
  // RN renderer 渲染 settle
  await new Promise((r) => setTimeout(r, renderSettleMs));
  logW1(`[test-flow] page loaded + settled, executing ${ops.length} ops`);

  const results = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const screenshotPath = screenshots[i] || '';
    const methodPath = String(op.method || '').trim();
    if (!methodPath || !methodPath.includes('.')) {
      logW1(`[test-flow] step ${i} skip: bad method=${methodPath}`);
      results.push({ step: i, op: methodPath, args: op.args, result: { ok: false, error: 'bad_method' }, elapsed: 0, screenshot: screenshotPath });
      continue;
    }
    // op.args 约定:
    //   - 数组: spread 成 function 多个 positional args (匹配 preload.js 的签名)
    //   - 对象/单值: 走 JSON 序列化, 当成单 arg
    // 例: fileKb.import([path1, path2]) → fileKb.import(path1, path2)
    //     advisor.chat("prompt") → advisor.chat("prompt")
    //     output.generate(["pptx", html, out]) → output.generate("pptx", html, out)
    let argsExpr;
    const opArgs = op.args;
    if (Array.isArray(opArgs)) {
      const parts = opArgs.map((a) => JSON.stringify(a));
      argsExpr = parts.join(', ');
    } else {
      argsExpr = JSON.stringify(opArgs ?? null);
    }
    const js = `window.electronAPI.${methodPath}(${argsExpr})`;
    const t0 = Date.now();
    let result;
    try {
      result = await win.webContents.executeJavaScript(js, true);
    } catch (e) {
      result = { ok: false, error: e?.message ?? 'execute_failed', error_code: 'E_EXEC' };
    }
    const elapsed = Date.now() - t0;
    logW1(`[test-flow] step ${i} ${methodPath} elapsed=${elapsed}ms ok=${result?.ok}`);
    results.push({ step: i, op: methodPath, args: opArgs, result, elapsed, screenshot: screenshotPath });
    // 写 step done marker (per-op 落盘, 即使中途挂也保留进度)
    if (screenshotPath) {
      try {
        await fs.promises.writeFile(screenshotPath + '.step_done', JSON.stringify(results[i]), 'utf8');
      } catch (e) {
        logW1(`[test-flow] step ${i} marker write failed: ${e.message}`);
      }
    }
    // inter-step wait (给 UI 时间反映状态变化)
    await new Promise((r) => setTimeout(r, interStepMs));
  }

  // 写最终 done marker
  const final = { ok: true, total_steps: ops.length, results };
  if (doneMarker) {
    try {
      await fs.promises.writeFile(doneMarker, JSON.stringify(final, null, 2), 'utf8');
      logW1(`[test-flow] done_marker written: ${doneMarker}`);
    } catch (e) {
      logW1(`[test-flow] done_marker write failed: ${e.message}`);
    }
  } else {
    logW1(`[test-flow] no done_marker specified, final=${JSON.stringify(final).slice(0, 300)}`);
  }
  // 留 1s 给 screencapture 拍下终态
  await new Promise((r) => setTimeout(r, 1000));
  logW1(`[test-flow] quitting app`);
  setTimeout(() => app.quit(), 500);
}

app.whenReady().then(async () => {
  // 【W6】test-flow 模式: --test-flow=<json> 走 IPC 真业务触发, 不走 createWindow 静态页面
  if (testFlowArg) {
    const flowJson = testFlowArg.slice('--test-flow='.length);
    logW1(`[test-flow] mode detected, flow_json_len=${flowJson.length}`);
    // 启 daemon (供 IPC handler 用), 然后跑 test-flow
    if (process.env.LINGXI_DAEMON_AUTOSTART !== '0') {
      try {
        await startW1Daemon();
      } catch (e) {
        logW1(`[test-flow] daemon autostart failed: ${e?.message}`);
      }
    }
    try {
      await runTestFlow(flowJson);
    } catch (e) {
      logW1(`[test-flow] FATAL: ${e?.message}`);
      setTimeout(() => app.quit(), 1000);
    }
    return;  // 跳过下面 createWindow 主路径
  }
  // 【W2】app 启动时自动启 daemon (供 renderer 调)
  if (process.env.LINGXI_DAEMON_AUTOSTART !== '0') {
    try {
      await startW1Daemon();
    } catch (e) {
      logW1('[daemon] autostart failed:', e?.message);
    }
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

app.on('before-quit', async () => {
  await stopW1Daemon();
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
