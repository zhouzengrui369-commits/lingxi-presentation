/**
 * Web-native React renderer for Electron BrowserWindow.
 *
 * 灵犀演示 · Phase 6 · T-6.1 — Electron ↔ RN 桥接
 *
 * 5 路由与 `apps/desktop/src/router.tsx` 的 ROUTES 数组完全对应:
 *   1. /file-kb   — 文件管理与 LLM Wiki (PRD 3.1)
 *   2. /advisor   — 顾问式需求交互 (PRD 3.2)
 *   3. /template  — 模板导入与适配 (PRD 3.3)
 *   4. /preview   — HTML 预览与编辑 (PRD 3.4)
 *   5. /output    — 多格式输出 (PRD 3.5)
 *
 * 设计取舍:
 *   - 不直接 import './router' 那个 RN router (它依赖 react-native 组件 + 业务模块的 fs/os)
 *   - 改成 web-native React + react-dom 渲染 5 个占位 screen + tab 导航
 *   - 同样的 5 路由, 同样的 ROUTES 数据, 同样的 'file-kb' | 'advisor' | 'template' | 'preview' | 'output' key
 *   - Phase 7 可换 react-native-web 接管, 这次先把 Electron BrowserWindow ↔ renderer bridge 跑通
 */
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './renderer.css';

// ---- 5 路由元数据 (与 src/router.tsx 保持一致) ----
export const ROUTES = [
  { key: 'file-kb', label: '文件管理', tag: 'T-1.1', prd: '3.1' },
  { key: 'advisor', label: '顾问交互', tag: 'T-1.2', prd: '3.2' },
  { key: 'template', label: '模板', tag: 'T-1.3', prd: '3.3' },
  { key: 'preview', label: '预览', tag: 'T-1.4', prd: '3.4' },
  { key: 'output', label: '输出', tag: 'T-1.5', prd: '3.5' },
];

const ROUTE_KEYS = ROUTES.map((r) => r.key);
const DEFAULT_ROUTE = 'file-kb';

// ---- 5 个 web-native 路由占位组件 ----
// 每个组件显示 路由名 + PRD 引用 + 一段说明 + 模拟进度条
function PlaceholderScreen({ route, demoLog }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 模拟模块加载进度
    const id = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 5));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>{route.label}</h2>
        <span className="badge">{route.tag}</span>
        <span className="badge subtle">PRD {route.prd}</span>
      </div>
      <p className="screen-desc">
        灵犀演示 · {route.label}模块 (T-6.1 Electron 桥接占位) — 真业务逻辑在
        <code> apps/desktop/src/modules/{route.key}/</code>
        下, BrowserWindow 通过 IPC 调用 main 进程的 daemon。
      </p>
      <div className="progress-row">
        <span className="label">模块加载</span>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="value">{progress}%</span>
      </div>
      <div className="actions">
        <button
          className="btn"
          onClick={() => {
            if (demoLog) demoLog(`[${route.tag}] ${route.label} 占位按钮点击 (web renderer)`);
          }}
        >
          测试按钮 (走 IPC)
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            if (window.electronAPI && window.electronAPI.demoLog) {
              window.electronAPI.demoLog(`[${route.tag}] ${route.label} 走 window.electronAPI`);
            }
          }}
        >
          测试 window.electronAPI
        </button>
      </div>
    </div>
  );
}

// ---- 主 Renderer 组件 ----
function App() {
  // T-6.1: 支持 URL hash 导航 (e.g. renderer.html#advisor) 方便 screenshot 5 路由
  const initialRoute = (() => {
    const hash = (window.location.hash || '').replace('#', '');
    return ROUTE_KEYS.includes(hash) ? hash : DEFAULT_ROUTE;
  })();
  const [active, setActive] = useState(initialRoute);
  const [logs, setLogs] = useState([]);

  // 同步 hash → active (允许 osascript / IPC 设置 hash 切 tab)
  useEffect(() => {
    const onHashChange = () => {
      const hash = (window.location.hash || '').replace('#', '');
      if (ROUTE_KEYS.includes(hash) && hash !== active) {
        setActive(hash);
        appendLog(`[hash] 切换到路由 ${hash}`);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // 把日志推到屏底 log panel
  const appendLog = (line) => {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [...prev.slice(-49), `[${ts}] ${line}`]);
  };

  // 暴露给 window 调试
  useEffect(() => {
    window.__lingxiDemo = {
      setRoute: (key) => {
        if (ROUTE_KEYS.includes(key)) {
          window.location.hash = key;
          setActive(key);
        }
      },
      appendLog,
      getActive: () => active,
      getRoutes: () => ROUTE_KEYS,
    };
  }, [active]);

  // 监听 IPC 消息 (Electron main process → renderer)
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onDemoLog) {
      const off = window.electronAPI.onDemoLog((line) => appendLog(line));
      return () => {
        if (typeof off === 'function') off();
      };
    }
  }, []);

  const currentRoute = ROUTES.find((r) => r.key === active) || ROUTES[0];

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div>
          <h1>灵犀演示 · 桌面</h1>
          <p>T-6.1 Electron BrowserWindow ↔ RN renderer 桥接验证</p>
        </div>
        <div className="app-header-meta">
          <span className="badge ok">Phase 6 · T-6.1</span>
          <span className="badge subtle">5 路由就绪</span>
        </div>
      </header>

      {/* Tab bar (5 路由导航) */}
      <nav className="tabbar">
        {ROUTES.map((r) => (
          <button
            key={r.key}
            className={`tab ${active === r.key ? 'active' : ''}`}
            onClick={() => {
              setActive(r.key);
              window.location.hash = r.key;
              appendLog(`[nav] 切换到路由 ${r.key} (${r.label})`);
            }}
            data-testid={`tab-${r.key}`}
          >
            <span className="tab-label">{r.label}</span>
            <span className="tab-tag">{r.tag}</span>
          </button>
        ))}
      </nav>

      {/* Content area: 当前路由的 screen */}
      <main className="content">
        <PlaceholderScreen route={currentRoute} demoLog={appendLog} />
      </main>

      {/* Log panel (屏底, 类似旧 renderer.html 的 log) */}
      <footer className="log-panel" data-testid="log-panel">
        <div className="log-title">实时日志 (renderer ↔ IPC)</div>
        <div className="log-body">
          {logs.length === 0 ? (
            <div className="log-line subtle">[就绪] 等待 IPC 消息…</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="log-line">
                {l}
              </div>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}

// ---- 启动 ----
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
  // 暴露给测试
  window.__lingxiRendered = true;
} else {
  console.error('[T-6.1] #root not found in DOM');
}
