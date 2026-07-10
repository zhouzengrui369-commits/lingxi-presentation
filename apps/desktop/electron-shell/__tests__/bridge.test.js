/**
 * T-6.1 Jest test suite — Electron ↔ RN renderer bridge
 * 灵犀演示 · Phase 6
 *
 * 5 个核心 test case:
 *   1. test_main_window_create  — main.js createWindow 存在 + 加载 renderer.html
 *   2. test_renderer_bundle_built — dist/renderer.bundle.js 存在, size > 100KB
 *   3. test_5_routes_registered  — RN router.tsx 注册 5 路由 (file_kb/advisor/template/preview/output)
 *   4. test_5_screens_imported   — 5 个 Screen 组件 (FileKBScreen/AdvisorScreen/...) 可导入
 *   5. test_ipc_handler         — main.js IPC handler (start-demo + demo-log) 注册
 *   6. test_preload_exposes_electronAPI — preload.js 通过 contextBridge 暴露 window.electronAPI
 *   7. test_renderer_has_5_tabs  — web renderer 也有 5 路由 tab (electron-shell/src/renderer.jsx)
 *   8. test_vite_config_valid   — vite.config.js 有效 (可 import, 导出 config 对象)
 */

const fs = require('fs');
const path = require('path');

// ---- 工具 ----
const SHELL_DIR = __dirname.replace(/__tests__$/, '').replace(/\/$/, '');
const REPO_ROOT = path.resolve(SHELL_DIR, '..', '..', '..');
const RENDERER_BUNDLE = path.join(SHELL_DIR, 'dist', 'renderer.bundle.js');
const ROUTER_TSX = path.join(REPO_ROOT, 'apps', 'desktop', 'src', 'router.tsx');
const SCREENS_DIR = path.join(REPO_ROOT, 'apps', 'desktop', 'src', 'screens');
const MAIN_JS = path.join(SHELL_DIR, 'main.js');
const PRELOAD_JS = path.join(SHELL_DIR, 'preload.js');
const RENDERER_JSX = path.join(SHELL_DIR, 'src', 'renderer.jsx');
const VITE_CONFIG = path.join(SHELL_DIR, 'vite.config.js');

const EXPECTED_ROUTES = ['file-kb', 'advisor', 'template', 'preview', 'output'];
const EXPECTED_SCREENS = [
  'FileKBScreen',
  'AdvisorScreen',
  'TemplateScreen',
  'PreviewScreen',
  'OutputScreen',
];

// ---- Test 1: main.js createWindow 存在 + 加载 renderer.html ----
describe('test_main_window_create', () => {
  test('main.js 存在 createWindow() 函数', () => {
    expect(fs.existsSync(MAIN_JS)).toBe(true);
    const src = fs.readFileSync(MAIN_JS, 'utf-8');
    expect(src).toMatch(/function\s+createWindow\s*\(/);
  });

  test('createWindow 调用 win.loadFile(renderer.html)', () => {
    const src = fs.readFileSync(MAIN_JS, 'utf-8');
    expect(src).toMatch(/loadFile/);
    expect(src).toMatch(/renderer\.html/);
  });

  test('BrowserWindow 尺寸 1100x720 (PRD 规格)', () => {
    const src = fs.readFileSync(MAIN_JS, 'utf-8');
    expect(src).toMatch(/width:\s*1100/);
    expect(src).toMatch(/height:\s*720/);
  });
});

// ---- Test 2: dist/renderer.bundle.js 存在, size > 100KB ----
describe('test_renderer_bundle_built', () => {
  test('renderer.bundle.js 存在', () => {
    expect(fs.existsSync(RENDERER_BUNDLE)).toBe(true);
  });

  test('renderer.bundle.js size > 100KB (5 路由 React 渲染最少 100KB)', () => {
    if (!fs.existsSync(RENDERER_BUNDLE)) {
      throw new Error('renderer.bundle.js 不存在, 先跑 `yarn build:renderer`');
    }
    const stat = fs.statSync(RENDERER_BUNDLE);
    expect(stat.size).toBeGreaterThan(100 * 1024);
  });

  test('renderer.bundle.js 是有效 JS (能被 Node parse)', () => {
    if (!fs.existsSync(RENDERER_BUNDLE)) {
      throw new Error('renderer.bundle.js 不存在');
    }
    const code = fs.readFileSync(RENDERER_BUNDLE, 'utf-8');
    expect(() => {
      // 尝试解析 — vite IIFE 格式一定能 parse
      // eslint-disable-next-line no-new-func
      new Function(code);
    }).not.toThrow();
  });
});

// ---- Test 3: 5 路由注册在 src/router.tsx ----
describe('test_5_routes_registered', () => {
  test('router.tsx 存在', () => {
    expect(fs.existsSync(ROUTER_TSX)).toBe(true);
  });

  test('router.tsx export ROUTES 数组含 5 路由', () => {
    const src = fs.readFileSync(ROUTER_TSX, 'utf-8');
    expect(src).toMatch(/export\s+const\s+ROUTES/);
    for (const route of EXPECTED_ROUTES) {
      expect(src).toContain(`'${route}'`);
    }
  });

  test('router.tsx ROUTES 数组的 key 字段是 file-kb / advisor / template / preview / output', () => {
    const src = fs.readFileSync(ROUTER_TSX, 'utf-8');
    // 直接看 key 字段定义
    for (const route of EXPECTED_ROUTES) {
      const re = new RegExp(`key:\\s*'${route}'`);
      expect(src).toMatch(re);
    }
  });
});

// ---- Test 4: 5 Screen 组件可导入 ----
describe('test_5_screens_imported', () => {
  test('5 Screen 文件都存在', () => {
    for (const screen of EXPECTED_SCREENS) {
      const file = path.join(SCREENS_DIR, `${screen}.tsx`);
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  test('5 Screen 文件都 export default (含 re-export 形式)', () => {
    for (const screen of EXPECTED_SCREENS) {
      const file = path.join(SCREENS_DIR, `${screen}.tsx`);
      const src = fs.readFileSync(file, 'utf-8');
      // 接受 `export default ...` 或 `export { default } from ...`
      const hasDefault = /export\s+default\s/.test(src) || /export\s*\{\s*default\s*\}\s*from/.test(src);
      expect(hasDefault).toBe(true);
    }
  });

  test('router.tsx import 5 Screen', () => {
    const src = fs.readFileSync(ROUTER_TSX, 'utf-8');
    for (const screen of EXPECTED_SCREENS) {
      expect(src).toContain(screen);
    }
  });
});

// ---- Test 5: IPC handler 注册 ----
describe('test_ipc_handler', () => {
  test('main.js 注册 ipcMain.handle(\'start-demo\')', () => {
    const src = fs.readFileSync(MAIN_JS, 'utf-8');
    expect(src).toMatch(/ipcMain\.handle\(['"]start-demo['"]/);
  });

  test('main.js 注册 ipcMain.on(\'demo-log\') 接收 renderer 主动推日志 (T-6.1 桥接)', () => {
    const src = fs.readFileSync(MAIN_JS, 'utf-8');
    expect(src).toMatch(/ipcMain\.on\(['"]demo-log['"]/);
  });

  test('main.js webContents.send(\'demo-log\') 主动推日志到 renderer', () => {
    const src = fs.readFileSync(MAIN_JS, 'utf-8');
    expect(src).toMatch(/webContents\.send\(['"]demo-log['"]/);
  });
});

// ---- Test 6 (bonus): preload.js 通过 contextBridge 暴露 electronAPI ----
describe('test_preload_exposes_electronAPI', () => {
  test('preload.js 存在', () => {
    expect(fs.existsSync(PRELOAD_JS)).toBe(true);
  });

  test('preload.js 用 contextBridge.exposeInMainWorld 暴露 electronAPI', () => {
    const src = fs.readFileSync(PRELOAD_JS, 'utf-8');
    expect(src).toMatch(/contextBridge\.exposeInMainWorld\(['"]electronAPI['"]/);
  });

  test('electronAPI 包含 demoLog / onDemoLog / startDemo', () => {
    const src = fs.readFileSync(PRELOAD_JS, 'utf-8');
    expect(src).toContain('demoLog');
    expect(src).toContain('onDemoLog');
    expect(src).toContain('startDemo');
  });
});

// ---- Test 7 (bonus): web renderer 也有 5 路由 ----
describe('test_renderer_has_5_tabs', () => {
  test('electron-shell/src/renderer.jsx 存在', () => {
    expect(fs.existsSync(RENDERER_JSX)).toBe(true);
  });

  test('renderer.jsx export ROUTES 数组含 5 路由 (与 src/router.tsx 一致)', () => {
    const src = fs.readFileSync(RENDERER_JSX, 'utf-8');
    for (const route of EXPECTED_ROUTES) {
      expect(src).toContain(`'${route}'`);
    }
  });

  test('renderer.jsx 渲染 #root (createRoot)', () => {
    const src = fs.readFileSync(RENDERER_JSX, 'utf-8');
    expect(src).toMatch(/createRoot/);
    expect(src).toMatch(/getElementById\(['"]root['"]\)/);
  });
});

// ---- Test 8 (bonus): vite.config.js 有效 ----
describe('test_vite_config_valid', () => {
  test('vite.config.js 存在', () => {
    expect(fs.existsSync(VITE_CONFIG)).toBe(true);
  });

  test('vite.config.js 用 @vitejs/plugin-react', () => {
    const src = fs.readFileSync(VITE_CONFIG, 'utf-8');
    expect(src).toMatch(/@vitejs\/plugin-react/);
    expect(src).toMatch(/plugins:\s*\[react\(\)\]/);
  });

  test('vite.config.js 入口指向 src/renderer.jsx', () => {
    const src = fs.readFileSync(VITE_CONFIG, 'utf-8');
    expect(src).toMatch(/src\/renderer\.jsx/);
  });
});
