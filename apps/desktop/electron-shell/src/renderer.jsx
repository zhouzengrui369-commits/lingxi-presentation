/**
 * Web-native React renderer for Electron BrowserWindow.
 *
 * 灵犀演示 · Phase 6 · T-6.1 — Electron ↔ RN 桥接
 *                 W2 (2026-07-13) — fail-closed 验证 + fell_back UI 警告
 *
 * 5 路由与 `apps/desktop/src/router.tsx` 的 ROUTES 数组完全对应:
 *   1. /file-kb   — 文件管理与 LLM Wiki (PRD 3.1)
 *   2. /advisor   — 顾问式需求交互 (PRD 3.2)
 *   3. /template  — 模板导入与适配 (PRD 3.3)
 *   4. /preview   — HTML 预览与编辑 (PRD 3.4)
 *   5. /output    — 多格式输出 (PRD 3.5)
 *
 * 【W2】关键改动:
 *   - §1.9 解析 data.fell_back 字段, 显式标 "⚠ LLM 降级" UI 警告 (Wave 1 verifier 报告 #4 PARTIAL)
 *   - 显示 provider_status (live / mock / unavailable) 让用户知道当前是 mock 还是真活
 *   - 5 路由真业务组件 + Loading/Success/Error/ProviderWarning 4 状态共享组件
 *
 * 设计取舍:
 *   - 不直接 import './router' 那个 RN router (它依赖 react-native 组件 + 业务模块的 fs/os)
 *   - 改成 web-native React + react-dom 渲染 5 个真业务 screen + tab 导航
 *   - Phase 7 可换 react-native-web 接管
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

// ---- 【W2 §1.9】Provider 状态警告横幅 ----
// Wave 1 verifier 报告 #4: fell_back 字段被 server 返, 但 renderer 不解析/不显示警告
// W2 改: 显式显示 provider_status 警告 (live / mock / unavailable)
function ProviderWarning({ providerStatus, fellBack, provider, content }) {
  if (providerStatus === 'live' && !fellBack) return null;
  const isMock = providerStatus === 'mock' || (content === 'hello (mock)');
  const isUnavailable = providerStatus === 'unavailable' || provider === 'unavailable';
  const isFallback = fellBack === true;
  let label = '';
  let severity = 'warning';
  if (isUnavailable) {
    label = '⚠ LLM 不可用: 无可用 provider (无 API key, CLI 也不可达). 显式启用 mock: 设 LINGXI_API_PROVIDER_ALLOW_MOCK=1';
    severity = 'error';
  } else if (isMock && isFallback) {
    label = '⚠ LLM 调用降级: provider=' + provider + ', fell_back=true, content="hello (mock)". 当前不是真活 LLM 输出';
    severity = 'warning';
  } else if (isMock) {
    label = '⚠ provider 显式 mock 模式: provider_status=' + providerStatus + ', content="hello (mock)"';
    severity = 'warning';
  } else if (isFallback) {
    label = '⚠ LLM 降级: fell_back=true, provider=' + provider;
    severity = 'warning';
  }
  return (
    <div className={`provider-warning ${severity}`} data-testid="provider-warning">
      <span className="warn-icon">{severity === 'error' ? '✕' : '⚠'}</span>
      <span className="warn-text">{label}</span>
    </div>
  );
}

// ---- 3 共享 UI 状态组件 (T-6.1 + W2 fail-closed 验证用) ----
function LoadingBlock({ label, detail }) {
  return (
    <div className="state-block loading" data-testid="loading-block">
      <div className="spinner" />
      <div className="label">{label}</div>
      {detail && <div className="detail">{detail}</div>}
    </div>
  );
}

function SuccessBlock({ title, summary, provider, providerStatus, fellBack, content, children }) {
  return (
    <div className="state-block success" data-testid="success-block">
      <div className="icon">✓</div>
      <div className="title">{title}</div>
      {summary && <div className="summary">{summary}</div>}
      {/* 【W2 §1.9】fell_back 警告: 即使是 success 状态, 也提示降级 */}
      {(fellBack || (providerStatus && providerStatus !== 'live')) && (
        <ProviderWarning providerStatus={providerStatus} fellBack={fellBack} provider={provider} content={content} />
      )}
      {children}
    </div>
  );
}

function ErrorBlock({ title = '请求失败', error, errorCode, latencyMs, onRetry, retryLabel = '🔄 重试' }) {
  return (
    <div className="state-block error" data-testid="error-block">
      <div className="icon">✕</div>
      <div className="title">{title}</div>
      {error && <div className="error-msg">{error}</div>}
      {errorCode && <div className="error-code">错误码: {errorCode}</div>}
      {latencyMs !== undefined && <div className="latency">耗时: {latencyMs}ms</div>}
      {onRetry && <button className="btn retry-btn" onClick={onRetry}>{retryLabel}</button>}
    </div>
  );
}

// ---- 5 路由真业务 web-native 组件 (T-6.1 + W1 接通 + W2 验证) ----
// 简化版, 每个组件演示 state machine (idle/loading/success/error) + 调真业务 electronAPI

function FileKbScreen({ appendLog }) {
  const [state, setState] = useState({ kind: 'idle' });
  const [kbInfo, setKbInfo] = useState(null);

  const doList = async () => {
    setState({ kind: 'loading' });
    appendLog('[file-kb] 列出 KB 文件...');
    try {
      const r = await window.electronAPI.fileKb.list();
      setKbInfo(r);
      setState({ kind: 'success', data: r });
      appendLog(`[file-kb] 列出 OK: ${r?.data?.total ?? 0} 文件`);
    } catch (e) {
      setState({ kind: 'error', error: e?.message ?? 'unknown' });
      appendLog(`[file-kb] 列出 FAIL: ${e?.message}`);
    }
  };

  const doImport = async () => {
    setState({ kind: 'loading' });
    appendLog('[file-kb] 导入测试文件...');
    try {
      const r = await window.electronAPI.fileKb.import(['/Users/njx/Project/wt-mvp-recovery-w2/apps/desktop/testdata/quarterly_review']);
      setState({ kind: 'success', data: r });
      appendLog(`[file-kb] 导入 OK: ${r?.data?.files ?? 0} 文件, ${r?.data?.entries ?? 0} wiki 条目`);
    } catch (e) {
      setState({ kind: 'error', error: e?.message ?? 'unknown' });
      appendLog(`[file-kb] 导入 FAIL: ${e?.message}`);
    }
  };

  return (
    <div className="screen file-kb">
      <div className="screen-header">
        <h2>文件管理 · KB 知识库</h2>
        <span className="badge">T-1.1</span>
        <span className="badge subtle">PRD 3.1</span>
      </div>
      <p className="screen-desc">导入文件夹 → 拆 5-10 文件 → LLM Wiki 提取。</p>
      <div className="actions">
        <button className="btn primary" onClick={doImport}>一键导入测试集</button>
        <button className="btn" onClick={doList}>刷新 KB 列表</button>
      </div>
      {state.kind === 'loading' && <LoadingBlock label="处理中..." detail="调 daemon /v1/import" />}
      {state.kind === 'success' && (
        <SuccessBlock
          title="导入完成"
          summary={`${state.data?.data?.files ?? 0} 文件, ${state.data?.data?.entries ?? 0} wiki 条目 · ${state.data?.latency_ms ?? 0}ms`}
        >
          {kbInfo && <div className="kb-list">KB: {kbInfo?.data?.total ?? 0} 文件</div>}
        </SuccessBlock>
      )}
      {state.kind === 'error' && <ErrorBlock title="导入失败" error={state.error} onRetry={doImport} />}
    </div>
  );
}

function AdvisorScreen({ appendLog }) {
  const [state, setState] = useState({ kind: 'idle' });
  const [chatResult, setChatResult] = useState(null);

  const doChat = async () => {
    setState({ kind: 'loading' });
    appendLog('[advisor] 调 /v1/chat...');
    try {
      const r = await window.electronAPI.advisor.chat('请推荐一个季度汇报的章节大纲');
      setChatResult(r);
      setState({ kind: 'success', data: r });
      appendLog(`[advisor] chat OK: provider=${r?.provider} fell_back=${r?.fell_back}`);
    } catch (e) {
      setState({ kind: 'error', error: e?.error ?? e?.message ?? 'unknown', errorCode: e?.error_code, latencyMs: e?.latency_ms });
      appendLog(`[advisor] chat FAIL: ${e?.error_code ?? e?.message}`);
    }
  };

  return (
    <div className="screen advisor">
      <div className="screen-header">
        <h2>顾问交互</h2>
        <span className="badge">T-1.2</span>
        <span className="badge subtle">PRD 3.2</span>
      </div>
      <p className="screen-desc">3 轮问询 + 选项 → 调 LLM 生成章节建议。</p>
      <div className="actions">
        <button className="btn primary" onClick={doChat}>调一次 LLM chat</button>
      </div>
      {state.kind === 'loading' && <LoadingBlock label="顾问思考中..." detail="调 daemon /v1/chat" />}
      {state.kind === 'success' && (
        <SuccessBlock
          title="顾问建议已生成"
          summary={`provider=${state.data?.provider} · ${state.data?.elapsed_ms ?? 0}ms`}
          provider={state.data?.provider}
          providerStatus={state.data?.provider_status}
          fellBack={state.data?.fell_back}
          content={state.data?.content}
        >
          <div className="chat-content">{(state.data?.content ?? '').slice(0, 200)}</div>
        </SuccessBlock>
      )}
      {state.kind === 'error' && (
        <ErrorBlock
          title="顾问调用失败"
          error={state.error}
          errorCode={state.errorCode}
          latencyMs={state.latencyMs}
          onRetry={doChat}
        />
      )}
    </div>
  );
}

function TemplateScreen({ appendLog }) {
  const [state, setState] = useState({ kind: 'idle' });

  const doSelect = async (builtin) => {
    setState({ kind: 'loading' });
    appendLog(`[template] 选 builtin=${builtin}...`);
    try {
      const r = await window.electronAPI.template.selectBuiltin(builtin);
      setState({ kind: 'success', data: r });
      appendLog(`[template] 选 OK: template_id=${r?.data?.template_id}`);
    } catch (e) {
      setState({ kind: 'error', error: e?.error ?? e?.message ?? 'unknown', errorCode: e?.error_code });
      appendLog(`[template] FAIL: ${e?.error_code ?? e?.message}`);
    }
  };

  return (
    <div className="screen template">
      <div className="screen-header">
        <h2>模板</h2>
        <span className="badge">T-1.3</span>
        <span className="badge subtle">PRD 3.3</span>
      </div>
      <p className="screen-desc">3 套 builtin 模板 (浅色 / 深色 / 学术报告) → 调 daemon 风格分析。</p>
      <div className="actions template-grid">
        <button className="btn template-card" onClick={() => doSelect('light')}>📄 简约商务·浅色</button>
        <button className="btn template-card" onClick={() => doSelect('dark')}>🌙 简约商务·深色</button>
        <button className="btn template-card" onClick={() => doSelect('academic')}>🎓 学术报告</button>
      </div>
      {state.kind === 'loading' && <LoadingBlock label="分析模板风格..." />}
      {state.kind === 'success' && (
        <SuccessBlock
          title="模板风格分析完成"
          summary={`template_id=${state.data?.data?.template_id} · ${state.data?.latency_ms ?? 0}ms`}
        >
          <div className="template-style">
            <div>palette.primary: {state.data?.data?.template_style?.palette?.primary}</div>
            <div>fonts.heading: {state.data?.data?.template_style?.fonts?.heading}</div>
          </div>
        </SuccessBlock>
      )}
      {state.kind === 'error' && <ErrorBlock title="模板选择失败" error={state.error} errorCode={state.errorCode} onRetry={() => doSelect('light')} />}
    </div>
  );
}

function PreviewScreen({ appendLog }) {
  const [state, setState] = useState({ kind: 'idle' });
  const [preview, setPreview] = useState(null);

  const doGenerate = async () => {
    setState({ kind: 'loading' });
    appendLog('[preview] 生成 HTML 预览...');
    try {
      const r = await window.electronAPI.preview.generate('灵犀演示 Q1 2026 季度汇报');
      setPreview(r);
      setState({ kind: 'success', data: r });
      appendLog(`[preview] 生成 OK: ${r?.data?.section_count ?? 0} 章节, ${r?.data?.latency_ms ?? 0}ms`);
    } catch (e) {
      setState({ kind: 'error', error: e?.error ?? e?.message ?? 'unknown', errorCode: e?.error_code });
      appendLog(`[preview] FAIL: ${e?.error_code ?? e?.message}`);
    }
  };

  return (
    <div className="screen preview">
      <div className="screen-header">
        <h2>预览</h2>
        <span className="badge">T-1.4</span>
        <span className="badge subtle">PRD 3.4</span>
      </div>
      <p className="screen-desc">输入主题 → 拆 5 章节 → 并发调 LLM → HTML 预览。</p>
      <div className="actions">
        <button className="btn primary" onClick={doGenerate}>生成预览</button>
      </div>
      {state.kind === 'loading' && <LoadingBlock label="生成 5 章节并发..." detail="调 daemon /v1/preview" />}
      {state.kind === 'success' && (
        <SuccessBlock
          title="预览生成完成"
          summary={`${state.data?.data?.section_count ?? 0} 章节 · ${state.data?.data?.latency_ms ?? 0}ms`}
          provider={state.data?.data?.provider}
          providerStatus={state.data?.data?.provider_status}
          fellBack={state.data?.data?.fell_back}
        >
          <div className="preview-sections">
            {(state.data?.data?.sections ?? []).map((s, i) => (
              <div key={i} className="section-item">
                <strong>{s.heading}</strong>: {(s.content_html ?? '').replace(/<[^>]+>/g, '').slice(0, 80)}
              </div>
            ))}
          </div>
        </SuccessBlock>
      )}
      {state.kind === 'error' && <ErrorBlock title="预览生成失败" error={state.error} errorCode={state.errorCode} onRetry={doGenerate} />}
    </div>
  );
}

function OutputScreen({ appendLog }) {
  const [state, setState] = useState({ kind: 'idle' });

  const doGenerate = async (format) => {
    setState({ kind: 'loading' });
    appendLog(`[output] 生成 ${format}...`);
    try {
      // 找最近一个 preview html
      const previewLoad = await window.electronAPI.preview.load('latest').catch(() => null);
      const htmlPath = previewLoad?.data?.html_path ?? '/tmp/lingxi_w1_4format_outputs/w1.html';
      const outputPath = `/tmp/lingxi_w2_output_test/Q1_2026_季度汇报.${format}`;
      const r = await window.electronAPI.output.generate(format, htmlPath, outputPath);
      setState({ kind: 'success', data: r, format });
      appendLog(`[output] ${format} OK: ${r?.data?.output_path ?? '?'}`);
    } catch (e) {
      setState({ kind: 'error', error: e?.error ?? e?.message ?? 'unknown', errorCode: e?.error_code });
      appendLog(`[output] FAIL: ${e?.error_code ?? e?.message}`);
    }
  };

  return (
    <div className="screen output">
      <div className="screen-header">
        <h2>输出</h2>
        <span className="badge">T-1.5</span>
        <span className="badge subtle">PRD 3.5</span>
      </div>
      <p className="screen-desc">4 格式生成 (PPTX / PDF / DOCX / HTML) → 调 daemon /v1/output。</p>
      <div className="actions output-grid">
        <button className="btn primary" onClick={() => doGenerate('pptx')}>📊 PPT 演示</button>
        <button className="btn" onClick={() => doGenerate('pdf')}>📄 PDF 文档</button>
        <button className="btn" onClick={() => doGenerate('docx')}>📝 Word 报告</button>
        <button className="btn" onClick={() => doGenerate('html')}>🌐 网页 HTML</button>
      </div>
      {state.kind === 'loading' && <LoadingBlock label={`生成 .${state.format}...`} />}
      {state.kind === 'success' && (
        <SuccessBlock
          title={`.${state.format} 已生成 ✓`}
          summary={`${state.data?.data?.size_bytes ?? 0}B · ${state.data?.data?.elapsed_ms ?? 0}ms`}
        >
          <div className="output-path">📁 {state.data?.data?.output_path ?? '?'}</div>
        </SuccessBlock>
      )}
      {state.kind === 'error' && <ErrorBlock title="生成失败" error={state.error} errorCode={state.errorCode} onRetry={() => doGenerate('pptx')} />}
    </div>
  );
}

// ---- 5 路由分发 ----
const SCREEN_MAP = {
  'file-kb': FileKbScreen,
  'advisor': AdvisorScreen,
  'template': TemplateScreen,
  'preview': PreviewScreen,
  'output': OutputScreen,
};

// ---- 主 Renderer 组件 ----
function App() {
  // T-6.1: 支持 URL hash 导航 (e.g. renderer.html#advisor) 方便 screenshot 5 路由
  const initialRoute = (() => {
    const hash = (window.location.hash || '').replace('#', '');
    return ROUTE_KEYS.includes(hash) ? hash : DEFAULT_ROUTE;
  })();
  const [active, setActive] = useState(initialRoute);
  const [logs, setLogs] = useState([]);
  const [daemonStatus, setDaemonStatus] = useState(null);

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

  // 【W2 §1.9】定期拉 daemon health, 显示全局 provider 状态
  useEffect(() => {
    let mounted = true;
    const pollHealth = async () => {
      try {
        const r = await window.electronAPI?.status?.daemonHealth?.();
        if (mounted && r) {
          setDaemonStatus(r);
        }
      } catch { /* ignore */ }
    };
    pollHealth();
    const t = setInterval(pollHealth, 5_000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  // 暴露给 window 调试 (real-runtime-validate 可用)
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
      getDaemonStatus: () => daemonStatus,
    };
  }, [active, daemonStatus]);

  // 监听 IPC 消息 (Electron main process → renderer)
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onDemoLog) {
      const off = window.electronAPI.onDemoLog((line) => appendLog(line));
      return () => {
        if (typeof off === 'function') off();
      };
    }
  }, []);

  const ScreenComponent = SCREEN_MAP[active] || FileKbScreen;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div>
          <h1>灵犀演示 · 桌面</h1>
          <p>Wave 2 · validator_security · fail-closed 验证器</p>
        </div>
        <div className="app-header-meta">
          {daemonStatus && (
            <span className={`badge ${daemonStatus.available ? 'ok' : 'degraded'}`}>
              daemon: {daemonStatus.status} (active_provider={daemonStatus.active_provider})
            </span>
          )}
          <span className="badge subtle">5 路由真业务</span>
        </div>
      </header>

      {/* 【W2 §1.9】全局 provider 警告 (当 daemon 不可用时显示) */}
      {daemonStatus && !daemonStatus.available && (
        <ProviderWarning
          providerStatus={daemonStatus.active_provider}
          fellBack={false}
          provider={daemonStatus.active_provider}
        />
      )}

      {/* Tab bar (5 路由导航) */}
      <nav className="tabbar" data-testid="tabbar">
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
      <main className="content" data-testid="content">
        <ScreenComponent appendLog={appendLog} />
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
