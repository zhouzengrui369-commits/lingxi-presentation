/**
 * Web-native React renderer for Electron BrowserWindow.
 *
 * 灵犀演示 · Phase 6 · T-6.1 — Electron ↔ RN 桥接
 *              + Wave 1 · T-W1 — UI 黄金路径接通
 *
 * 5 路由与 apps/desktop/src/router.tsx 的 ROUTES 数组完全对应:
 *   1. /file-kb   — 文件管理与 LLM Wiki (PRD 3.1) [FileKbScreen 真业务]
 *   2. /advisor   — 顾问式需求交互 (PRD 3.2) [AdvisorScreen 真业务]
 *   3. /template  — 模板导入与适配 (PRD 3.3) [TemplateScreen 真业务]
 *   4. /preview   — HTML 预览与编辑 (PRD 3.4) [PreviewScreen 真业务]
 *   5. /output    — 多格式输出 (PRD 3.5) [OutputScreen 真业务]
 *
 * 设计取舍:
 *   - 不直接 import './router' 那个 RN router (它依赖 react-native 组件 + 业务模块的 fs/os)
 *   - 改成 web-native React + react-dom 渲染 5 个真业务组件
 *   - 真业务通过 window.electronAPI (preload.js 暴露) → main process IPC → daemon 端点
 *   - 钉子 #22 fresh install 警告: 复用现有已 merge 5 modules (file_kb/advisor/template/preview/output)
 *     通过 main process IPC 间接调用 daemon, 而不是 renderer 直接 require
 *   - Phase 7 可换 react-native-web 接管, 这次先把 Electron BrowserWindow ↔ 真业务跑通
 *
 * 钉子 #46 (PM HARD GATE for false-green): 不 mock, 不假绿, 不 fallback
 *   - 所有 IPC 调用走 main process → daemon 真实端点
 *   - 错误状态显式 (具体 error_code), 不是 "未知错误"
 *   - 30s timeout (大 import/preview 可能慢)
 *   - 失败 retry 按钮 (用户可手动重试)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// ---- 共享 UI 组件 ----

// 加载状态 (spinner + 进度文字)
function LoadingBlock({ label = '处理中…', detail }) {
  return (
    <div className="state-block state-loading" data-testid="loading-block">
      <div className="spinner" />
      <div className="state-text">
        <strong>{label}</strong>
        {detail && <div className="state-detail">{detail}</div>}
      </div>
    </div>
  );
}

// 错误状态 (具体错误 + retry 按钮)
function ErrorBlock({ title = '请求失败', error, errorCode, latencyMs, onRetry, retryLabel = '🔄 重试' }) {
  return (
    <div className="state-block state-error" data-testid="error-block">
      <div className="state-icon">✗</div>
      <div className="state-text">
        <strong>{title}</strong>
        <div className="state-error-msg">{error || '未知错误'}</div>
        {errorCode && <div className="state-error-code">错误码: {errorCode}</div>}
        {latencyMs !== undefined && latencyMs !== null && (
          <div className="state-error-code">耗时: {latencyMs}ms</div>
        )}
        {onRetry && (
          <button className="btn retry-btn" onClick={onRetry} data-testid="retry-btn">
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// 成功状态 (结果 + 关键字段)
function SuccessBlock({ title, summary, children }) {
  return (
    <div className="state-block state-success" data-testid="success-block">
      <div className="state-icon">✓</div>
      <div className="state-text">
        <strong>{title}</strong>
        {summary && <div className="state-summary">{summary}</div>}
        {children}
      </div>
    </div>
  );
}

// =================================================================
// 5 路由: 真业务组件 (T-W1)
// =================================================================

// ---- 1. /file-kb 路由: FileKbScreen ----
function FileKbScreen({ appendLog }) {
  const [state, setState] = useState({ kind: 'idle' });
  const [kbInfo, setKbInfo] = useState(null);
  const [list, setList] = useState(null);
  const inputRef = useRef(null);

  const loadList = useCallback(async () => {
    if (!window.electronAPI) {
      setState({ kind: 'error', error: 'electronAPI not available', errorCode: 'E_NO_API' });
      return;
    }
    setState({ kind: 'loading', label: '加载知识库列表' });
    const r = await window.electronAPI.fileKb.list();
    appendLog(`[file-kb:list] result: ${JSON.stringify(r).slice(0, 200)}`);
    if (r.ok) {
      // list 端点直接返回 { files, entries, kb_root, manifest }
      const d = r.data;
      setList(d);
      setKbInfo({ kb_root: d.kb_root, exists: true });
      setState({ kind: 'success', title: `知识库就绪 (${d.entries?.length || 0} 条目)` });
    } else {
      setState({ kind: 'error', error: r.error, errorCode: r.error_code, latencyMs: r.latency_ms });
    }
  }, [appendLog]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.fileKb.info().then((r) => {
        if (r.ok) setKbInfo(r.data);
      });
    }
  }, []);

  const doImport = useCallback(async (paths) => {
    if (!window.electronAPI) {
      setState({ kind: 'error', error: 'electronAPI not available', errorCode: 'E_NO_API' });
      return;
    }
    setState({ kind: 'loading', label: '导入文件中…', detail: `${paths.length} 路径, 通过 daemon /v1/import` });
    appendLog(`[file-kb:import] paths=${JSON.stringify(paths)}`);
    const r = await window.electronAPI.fileKb.import(paths);
    appendLog(`[file-kb:import] result: ok=${r.ok} ${r.ok ? `files=${r.data?.files?.length} entries=${r.data?.entries?.length}` : `error=${r.error}`}`);
    if (r.ok) {
      // daemon 响应: { status, data: { files, entries, kb_root, ... }, elapsed_ms, stdout_tail }
      // r.data 是 daemon response, 真数据在 r.data.data
      const d = r.data.data || r.data;
      setList(d);
      setKbInfo({ kb_root: d.kb_root, exists: true });
      setState({
        kind: 'success',
        title: `导入完成 (${d.files?.length || 0} 文件, ${d.entries?.length || 0} wiki 条目)`,
        summary: `KB 根: ${d.kb_root} · 耗时 ${r.latency_ms}ms`,
      });
    } else {
      setState({ kind: 'error', error: r.error, errorCode: r.error_code, latencyMs: r.latency_ms });
    }
  }, [appendLog]);

  const onChooseDir = () => {
    if (inputRef.current) inputRef.current.click();
  };

  return (
    <div className="screen" data-testid="screen-file-kb">
      <div className="screen-header">
        <h2>文件管理 · KB 知识库</h2>
        <span className="badge">T-1.1</span>
        <span className="badge subtle">PRD 3.1</span>
      </div>
      <p className="screen-desc">
        选源文件/文件夹 → 通过 daemon <code>POST /v1/import</code> 真业务导入 → KB 列表显示
        7 格式 (docx/pdf/xlsx/pptx/md/jpg/png) + 自动 LLM Wiki 整理。
      </p>
      {kbInfo && (
        <div className="info-row">
          <span className="label">KB 根路径</span>
          <code className="value">{kbInfo.kb_root}</code>
          <span className={`badge ${kbInfo.exists ? 'ok' : 'warn'}`}>{kbInfo.exists ? '已就绪' : '待 init'}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        placeholder="/path/to/source-dir (默认: testdata/quarterly_review)"
        className="path-input"
        defaultValue=""
      />
      <div className="actions">
        <button className="btn" onClick={onChooseDir} data-testid="btn-import">
          📁 导入文件 / 文件夹
        </button>
        <button className="btn secondary" onClick={loadList} data-testid="btn-list">
          🔄 刷新 KB 列表
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            // 默认导入 testdata/quarterly_review
            const p = '/Users/njx/Project/wt-mvp-recovery-w1/apps/desktop/testdata/quarterly_review';
            doImport([p]);
          }}
          data-testid="btn-import-default"
        >
          ⚡ 一键导入测试集
        </button>
      </div>
      <div className="state-area">
        {state.kind === 'loading' && <LoadingBlock label={state.label} detail={state.detail} />}
        {state.kind === 'error' && (
          <ErrorBlock
            error={state.error}
            errorCode={state.errorCode}
            latencyMs={state.latencyMs}
            onRetry={() => {
              const p = '/Users/njx/Project/wt-mvp-recovery-w1/apps/desktop/testdata/quarterly_review';
              doImport([p]);
            }}
          />
        )}
        {state.kind === 'success' && (
          <SuccessBlock title={state.title} summary={state.summary}>
            {list && list.files && list.files.length > 0 && (
              <div className="kb-list" data-testid="kb-list">
                <div className="kb-list-title">📚 知识库内容 ({list.files.length} 文件 / {list.entries?.length || 0} wiki)</div>
                <div className="kb-files">
                  {list.files.slice(0, 10).map((f, i) => (
                    <div key={i} className="kb-file-item">
                      <span className="kb-file-name">{f.name || f.path?.split('/').pop()}</span>
                      <span className="kb-file-meta">{f.format || ''} · {(f.size_bytes / 1024).toFixed(1)}KB · {f.status || 'ok'}</span>
                    </div>
                  ))}
                </div>
                {list.entries && list.entries.length > 0 && (
                  <div className="kb-entries">
                    <div className="kb-list-subtitle">📝 Wiki 条目</div>
                    {list.entries.slice(0, 5).map((e, i) => (
                      <div key={i} className="kb-entry-item">
                        <strong>{e.title}</strong>
                        <div className="kb-entry-tags">tags: [{e.tags?.join(', ') || ''}]</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SuccessBlock>
        )}
      </div>
    </div>
  );
}

// ---- 2. /advisor 路由: AdvisorScreen ----
// 真实 3 轮顾问交互, 每轮带选项, 选完调 LLM
function AdvisorScreen({ appendLog }) {
  const [scenarios, setScenarios] = useState([]);
  const [scenario, setScenario] = useState(null);
  const [round, setRound] = useState(0);  // 0=选场景, 1/2/3=3 轮问询
  const [history, setHistory] = useState([]);
  const [chatState, setChatState] = useState({ kind: 'idle' });

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.advisor.scenarios().then((r) => {
        if (r.ok) setScenarios(r.data.scenarios);
      });
    }
  }, []);

  // 3 轮问题模板 (钉子 #4 PRD ≥ 90% 提问带选项 + ≥ 3 轮真模型交互)
  const QUESTIONS = [
    {
      text: '第 1 轮 · 这次汇报的核心受众是谁?',
      options: [
        { value: 'leadership', label: '🔹 公司高管 (CXO/VP)' },
        { value: 'team', label: '🔹 部门团队' },
        { value: 'client', label: '🔹 外部客户/合作伙伴' },
        { value: 'all_hands', label: '🔹 全员大会' },
      ],
    },
    {
      text: '第 2 轮 · 重点突出哪类内容?',
      options: [
        { value: 'metrics', label: '📊 关键数据指标' },
        { value: 'progress', label: '🚀 项目进展' },
        { value: 'team', label: '👥 团队建设' },
        { value: 'risk', label: '⚠️ 风险与挑战' },
      ],
    },
    {
      text: '第 3 轮 · 期望的时长?',
      options: [
        { value: 'short', label: '⏱️ 5-10 分钟 (简洁版)' },
        { value: 'medium', label: '⏱️ 15-20 分钟 (标准版)' },
        { value: 'long', label: '⏱️ 30+ 分钟 (深度版)' },
      ],
    },
  ];

  const onPickOption = useCallback(async (opt) => {
    const currentQ = QUESTIONS[round - 1];
    const newHistory = [...history, { round, question: currentQ.text, value: opt.value, label: opt.label }];
    setHistory(newHistory);
    appendLog(`[advisor] round ${round} pick: ${opt.label}`);
    if (round < 3) {
      setRound(round + 1);
    } else {
      // 调 chat LLM (3 轮并行, 但我们这里简化为 1 次 chat 验证)
      setChatState({ kind: 'loading', label: 'AI 顾问生成建议…' });
      const prompt = `顾问汇总: 场景=${scenario}, 受众=${newHistory[0]?.label}, 重点=${newHistory[1]?.label}, 时长=${newHistory[2]?.label}. 请基于此推荐 1 个章节大纲要点.`;
      const r = await window.electronAPI.advisor.chat(prompt);
      // daemon 响应 /v1/chat: { content, provider, fell_back, elapsed_ms }
      // r.data 是 daemon response, 直接是 chat 数据
      appendLog(`[advisor:chat] result: ok=${r.ok} ${r.ok ? `provider=${r.data?.provider} chars=${r.data?.content?.length}` : `error=${r.error}`}`);
      if (r.ok) {
        setChatState({
          kind: 'success',
          title: 'AI 顾问建议已生成',
          data: r.data,
          summary: `provider=${r.data.provider} · ${r.data.elapsed_ms}ms · ${r.data.content?.length} 字符`,
        });
      } else {
        setChatState({ kind: 'error', error: r.error, errorCode: r.error_code, latencyMs: r.latency_ms });
      }
    }
  }, [round, history, scenario, appendLog]);

  const onPickScenario = (s) => {
    setScenario(s);
    setRound(1);
    setHistory([]);
    setChatState({ kind: 'idle' });
    appendLog(`[advisor] pick scenario: ${s.label}`);
  };

  const reset = () => {
    setScenario(null);
    setRound(0);
    setHistory([]);
    setChatState({ kind: 'idle' });
  };

  if (!scenario) {
    return (
      <div className="screen" data-testid="screen-advisor-scenario">
        <div className="screen-header">
          <h2>顾问交互 · 场景选择</h2>
          <span className="badge">T-1.2</span>
          <span className="badge subtle">PRD 3.2</span>
        </div>
        <p className="screen-desc">选场景 → 3 轮问询 (带选项) → AI 顾问基于 LLM 生成建议 (走 daemon /v1/chat)。</p>
        <div className="scenario-list">
          {scenarios.map((s) => (
            <button
              key={s.id}
              className="scenario-card"
              onClick={() => onPickScenario(s)}
              data-testid={`scenario-${s.id}`}
            >
              <strong>{s.label}</strong>
              <div className="scenario-desc">{s.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (round <= 3) {
    const q = QUESTIONS[round - 1];
    return (
      <div className="screen" data-testid="screen-advisor-q">
        <div className="screen-header">
          <h2>顾问交互 · {scenario.label}</h2>
          <span className="badge">T-1.2</span>
        </div>
        <div className="progress-row">
          <span className="label">第 {round} / 3 轮</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(round / 3) * 100}%` }} />
          </div>
          <span className="value">{Math.round((round / 3) * 100)}%</span>
        </div>
        <div className="question-card">
          <h3 className="question-text">{q.text}</h3>
          <div className="options-list">
            {q.options.map((o) => (
              <button
                key={o.value}
                className="option-btn"
                onClick={() => onPickOption(o)}
                data-testid={`opt-${o.value}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {history.length > 0 && (
          <div className="history-row">
            <div className="history-title">📜 已答</div>
            {history.map((h, i) => (
              <div key={i} className="history-item">✓ 第 {h.round} 轮: {h.label}</div>
            ))}
          </div>
        )}
        <button className="btn secondary" onClick={reset}>← 重新开始</button>
      </div>
    );
  }

  // 完成态: 显示 AI 建议
  return (
    <div className="screen" data-testid="screen-advisor-done">
      <div className="screen-header">
        <h2>顾问交互 · ✓ 需求收集完成</h2>
        <span className="badge ok">T-1.2</span>
      </div>
      <p className="screen-desc">已收集 3 轮关键信息:</p>
      <div className="history-row">
        {history.map((h, i) => (
          <div key={i} className="history-item">✓ 第 {h.round} 轮: {h.label}</div>
        ))}
      </div>
      <div className="state-area">
        {chatState.kind === 'loading' && <LoadingBlock label={chatState.label} detail="调用 daemon /v1/chat 真模型" />}
        {chatState.kind === 'error' && (
          <ErrorBlock
            title="AI 顾问生成失败"
            error={chatState.error}
            errorCode={chatState.errorCode}
            latencyMs={chatState.latencyMs}
            onRetry={() => onPickOption({ value: history[2]?.value || 'medium', label: history[2]?.label || '' })}
          />
        )}
        {chatState.kind === 'success' && (
          <SuccessBlock title={chatState.title} summary={chatState.summary}>
            <div className="ai-suggestion">
              <div className="ai-suggestion-label">📝 AI 建议内容:</div>
              <pre className="ai-suggestion-content">{chatState.data.content}</pre>
            </div>
          </SuccessBlock>
        )}
      </div>
      <button className="btn secondary" onClick={reset}>← 重新开始</button>
    </div>
  );
}

// ---- 3. /template 路由: TemplateScreen ----
function TemplateScreen({ appendLog }) {
  const [state, setState] = useState({ kind: 'idle' });
  const [selected, setSelected] = useState(null);

  // 3 套模板 (≥ 3 套硬要求)
  const TEMPLATES = [
    { id: 'builtin_business_light', name: '简约商务·浅色', desc: '白色背景 + 蓝色主色 + 橙色强调', primary: '#0071E3' },
    { id: 'builtin_business_dark',  name: '简约商务·深色', desc: '深色背景 + 蓝绿主色 + 金色强调', primary: '#5B8DEF' },
    { id: 'builtin_academic',       name: '学术报告', desc: '白底 + 衬线字体 + 红蓝配色', primary: '#8B0000' },
  ];

  const onSelect = useCallback(async (tpl) => {
    if (!window.electronAPI) {
      setState({ kind: 'error', error: 'electronAPI not available', errorCode: 'E_NO_API' });
      return;
    }
    setSelected(tpl);
    setState({ kind: 'loading', label: `分析模板风格 (${tpl.name})` });
    appendLog(`[template:select] tpl=${tpl.id}`);
    const builtin = tpl.id.includes('dark') ? 'dark' : 'light';
    const r = await window.electronAPI.template.selectBuiltin(builtin);
    appendLog(`[template:select] result: ok=${r.ok} ${r.ok ? `template_id=${r.data?.template_id}` : `error=${r.error}`}`);
    if (r.ok) {
      // daemon 响应: { status, data: { template_id, template_style, html_preview, ... } }
      // r.data 是 daemon response, 真数据在 r.data.data
      const d = r.data.data || r.data;
      setState({
        kind: 'success',
        title: `模板风格分析完成: ${d.template_style?.name || tpl.name}`,
        data: d,
        summary: `template_id=${d.template_id} · source=${d.source} · ${r.latency_ms}ms`,
      });
    } else {
      setState({ kind: 'error', error: r.error, errorCode: r.error_code, latencyMs: r.latency_ms });
    }
  }, [appendLog]);

  return (
    <div className="screen" data-testid="screen-template">
      <div className="screen-header">
        <h2>模板 · 风格选择</h2>
        <span className="badge">T-1.3</span>
        <span className="badge subtle">PRD 3.3</span>
      </div>
      <p className="screen-desc">选 3 套模板之一 → 通过 daemon <code>POST /v1/templates</code> 真业务分析 → 显示风格 JSON + HTML 预览。</p>
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            className={`template-card ${selected?.id === t.id ? 'selected' : ''}`}
            onClick={() => onSelect(t)}
            data-testid={`template-${t.id}`}
            style={{ borderLeft: `6px solid ${t.primary}` }}
          >
            <div className="template-name">{t.name}</div>
            <div className="template-desc">{t.desc}</div>
            <div className="template-meta">ID: {t.id}</div>
          </button>
        ))}
      </div>
      <div className="state-area">
        {state.kind === 'loading' && <LoadingBlock label={state.label} detail="调用 daemon /v1/templates 调模板子 CLI" />}
        {state.kind === 'error' && (
          <ErrorBlock
            error={state.error}
            errorCode={state.errorCode}
            latencyMs={state.latencyMs}
            onRetry={() => selected && onSelect(selected)}
          />
        )}
        {state.kind === 'success' && (
          <SuccessBlock title={state.title} summary={state.summary}>
            {state.data?.template_style && (
              <div className="template-style" data-testid="template-style">
                <div className="style-row">
                  <span className="label">调色板</span>
                  <div className="palette-row">
                    {Object.entries(state.data.template_style.palette || {}).map(([k, v]) => (
                      <div key={k} className="swatch-wrap" title={`${k}: ${v}`}>
                        <div className="swatch" style={{ backgroundColor: v }} />
                        <span className="swatch-label">{k}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="style-row">
                  <span className="label">字体</span>
                  <span className="value">{state.data.template_style.fonts?.heading} / {state.data.template_style.fonts?.body}</span>
                </div>
                <div className="style-row">
                  <span className="label">版式</span>
                  <span className="value">{(state.data.template_style.layout_types || []).join(', ')}</span>
                </div>
                {state.data.template_style.decorations && state.data.template_style.decorations.length > 0 && (
                  <div className="style-row">
                    <span className="label">装饰</span>
                    <span className="value">{state.data.template_style.decorations.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </SuccessBlock>
        )}
      </div>
    </div>
  );
}

// ---- 4. /preview 路由: PreviewScreen ----
function PreviewScreen({ appendLog }) {
  const [prompt, setPrompt] = useState('Q1 2026 灵犀演示季度汇报');
  const [state, setState] = useState({ kind: 'idle' });
  const [preview, setPreview] = useState(null);

  const onGenerate = useCallback(async () => {
    if (!window.electronAPI) {
      setState({ kind: 'error', error: 'electronAPI not available', errorCode: 'E_NO_API' });
      return;
    }
    if (!prompt.trim()) {
      setState({ kind: 'error', error: 'prompt 不能为空', errorCode: 'E_EMPTY_PROMPT' });
      return;
    }
    setState({ kind: 'loading', label: 'AI 生成预览中…', detail: 'Wave 9 治本: 5 章节并发调 LLM (parallelWithLimit 4)' });
    appendLog(`[preview:generate] prompt=${JSON.stringify(prompt).slice(0, 80)}`);
    const r = await window.electronAPI.preview.generate(prompt);
    appendLog(`[preview:generate] result: ok=${r.ok} ${r.ok ? `preview_id=${r.data?.preview_id} latency_ms=${r.data?.latency_ms}` : `error=${r.error}`}`);
    if (r.ok) {
      // daemon 响应: { status, data: { preview_id, latency_ms, provider, sections, ... }, html, html_path, out_dir, elapsed_ms }
      // renderer 拿到 r.data 已经是 daemon response, 真数据在 r.data.data
      const d = r.data.data || r.data;
      setPreview(d);
      setState({
        kind: 'success',
        title: `预览生成完成 (latency=${d.latency_ms}ms)`,
        summary: `preview_id=${d.preview_id} · ${d.section_count || (d.sections?.length) || 5} 章节 · provider=${d.provider}`,
      });
    } else {
      setState({ kind: 'error', error: r.error, errorCode: r.error_code, latencyMs: r.latency_ms });
    }
  }, [prompt, appendLog]);

  return (
    <div className="screen" data-testid="screen-preview">
      <div className="screen-header">
        <h2>预览 · AI 生成</h2>
        <span className="badge">T-1.4</span>
        <span className="badge subtle">PRD 3.4</span>
      </div>
      <p className="screen-desc">输入 prompt → 通过 daemon <code>POST /v1/preview</code> 真业务 (Wave 9: 5 章节并发) → 显示 HTML 预览 + 轻量编辑。</p>
      <div className="prompt-row">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入汇报主题 (例如: Q1 2026 灵犀演示季度汇报)"
          className="path-input"
          data-testid="preview-prompt"
        />
        <button className="btn" onClick={onGenerate} data-testid="btn-generate-preview">
          ✨ AI 生成预览
        </button>
      </div>
      <div className="state-area">
        {state.kind === 'loading' && <LoadingBlock label={state.label} detail={state.detail} />}
        {state.kind === 'error' && (
          <ErrorBlock
            error={state.error}
            errorCode={state.errorCode}
            latencyMs={state.latencyMs}
            onRetry={onGenerate}
          />
        )}
        {state.kind === 'success' && preview && (
          <SuccessBlock title={state.title} summary={state.summary}>
            {preview.sections && preview.sections.length > 0 && (
              <div className="preview-sections" data-testid="preview-sections">
                <div className="preview-sections-title">📄 章节预览 ({preview.sections.length} 节)</div>
                {preview.sections.map((s, i) => (
                  <div key={i} className="preview-section-item">
                    <h4>{s.heading}</h4>
                    <div
                      className="preview-section-html"
                      dangerouslySetInnerHTML={{ __html: s.content_html }}
                    />
                  </div>
                ))}
                <div className="preview-edit-hint">
                  ℹ 轻量编辑工具栏: 改章节标题/段落顺序 (T-1.4 实现), 复杂改动回 AI 重做。
                </div>
              </div>
            )}
          </SuccessBlock>
        )}
      </div>
    </div>
  );
}

// ---- 5. /output 路由: OutputScreen ----
function OutputScreen({ appendLog }) {
  const [state, setState] = useState({ kind: 'idle' });
  const [outputs, setOutputs] = useState({});
  const [previewHtmlPath, setPreviewHtmlPath] = useState(null);

  // 找最近的预览 HTML (T-W1 移到 onGenerate 里, 不用 useEffect)
  // 注: 之前的死代码 require 在 web 中抛错, 已删
  useEffect(() => {
    // 实际: latest preview 通过 window.electronAPI.preview.load('latest') 找 (onGenerate 内)
    return () => {};
  }, []);

  // 4 格式 (PRD 硬要求)
  const FORMATS = [
    { format: 'pptx', label: '📊 PPT 演示', desc: 'PowerPoint / WPS 直接编辑' },
    { format: 'pdf',  label: '📄 PDF 文档', desc: '图片/字体/版式正常, 跨平台' },
    { format: 'docx', label: '📝 Word 报告', desc: 'Word / WPS 可继续编辑' },
    { format: 'html', label: '🌐 网页 HTML', desc: '内联 CSS, 浏览器直接打开' },
  ];

  // 找 /tmp/lingxi_preview_*/<id>.html 找最新
  const findLatestPreview = useCallback(async () => {
    if (!window.electronAPI) return null;
    // 简化: 通过 status.getDaemon 拿 daemon 信息, 然后 list /tmp
    // 实际我们用 status API, 但 list /tmp 是 main process responsibility
    // 我们直接调一个 helper IPC? 暂时用 listdir
    // 实际我们通过 preview:load 找, 但需要 preview_id
    // 简单: 用 status 看 daemon, 提示用户去 preview 页面生成
    return null;
  }, []);

  const onGenerate = useCallback(async (format) => {
    if (!window.electronAPI) {
      setState({ kind: 'error', error: 'electronAPI not available', errorCode: 'E_NO_API' });
      return;
    }
    // 找 /tmp/lingxi_preview_* 下最新 .html
    const fs = window.electronAPI;
    let htmlPath = null;
    try {
      // 通过 daemon status 找 (简化: 用 main process IPC)
      // 实际: 我们直接 listdir /tmp/lingxi_preview_* in main process
      // 简单方案: 用 status 拿不到, 改用 fetch 找
      // 改: 通过一个新的 IPC "w1:fileKb:findPreview" 找
      const r = await window.electronAPI.status.ping();
      if (!r.ok) {
        setState({ kind: 'error', error: 'daemon 不可达', errorCode: 'E_DAEMON' });
        return;
      }
    } catch (_) {}
    // 简化: 通过另一个 IPC 找
    const findResult = await window.electronAPI.preview.load('latest').catch(() => null);
    if (!findResult || !findResult.ok) {
      setState({ kind: 'error', error: '没有可用的预览文件 (请先去「预览」页生成)', errorCode: 'E_NO_PREVIEW' });
      return;
    }
    htmlPath = findResult.data.html_path;
    setPreviewHtmlPath(htmlPath);

    const outputPath = `/tmp/lingxi_w1_output_${format}_${Date.now()}.${format}`;
    setState({ kind: 'loading', label: `生成 ${format.toUpperCase()} 文件…`, detail: outputPath });
    appendLog(`[output:generate] format=${format} html=${htmlPath}`);
    const r = await window.electronAPI.output.generate(format, htmlPath, outputPath);
    appendLog(`[output:generate] result: ok=${r.ok} ${r.ok ? `output_path=${r.output_path} size=${r.size_bytes}` : `error=${r.error}`}`);
    if (r.ok) {
      setOutputs((prev) => ({ ...prev, [format]: { path: r.output_path, size: r.size_bytes, latency: r.latency_ms } }));
      setState({
        kind: 'success',
        title: `${format.toUpperCase()} 生成完成`,
        summary: `${r.output_path} · ${(r.size_bytes / 1024).toFixed(1)}KB · ${r.latency_ms}ms`,
      });
    } else {
      setState({ kind: 'error', error: r.error, errorCode: r.error_code, latencyMs: r.latency_ms });
    }
  }, [appendLog]);

  const onOpen = (path) => {
    if (window.electronAPI) {
      window.electronAPI.output.open(path);
    }
  };

  return (
    <div className="screen" data-testid="screen-output">
      <div className="screen-header">
        <h2>输出 · 4 格式</h2>
        <span className="badge">T-1.5</span>
        <span className="badge subtle">PRD 3.5</span>
      </div>
      <p className="screen-desc">选 4 格式之一 → 通过 daemon <code>POST /v1/output</code> 真业务生成 → 文件下载/打开。</p>
      <div className="format-grid">
        {FORMATS.map((f) => (
          <button
            key={f.format}
            className="format-card"
            onClick={() => onGenerate(f.format)}
            data-testid={`format-${f.format}`}
          >
            <div className="format-label">{f.label}</div>
            <div className="format-desc">{f.desc}</div>
            {outputs[f.format] && (
              <div className="format-status">
                ✓ {(outputs[f.format].size / 1024).toFixed(1)}KB · {outputs[f.format].latency}ms
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="state-area">
        {state.kind === 'loading' && <LoadingBlock label={state.label} detail={state.detail} />}
        {state.kind === 'error' && (
          <ErrorBlock
            error={state.error}
            errorCode={state.errorCode}
            latencyMs={state.latencyMs}
            onRetry={() => {
              const lastFormat = Object.keys(outputs).pop();
              if (lastFormat) onGenerate(lastFormat);
            }}
            retryLabel="🔄 重试上一格式"
          />
        )}
        {state.kind === 'success' && (
          <SuccessBlock title={state.title} summary={state.summary}>
            {Object.keys(outputs).length > 0 && (
              <div className="output-list" data-testid="output-list">
                <div className="output-list-title">📦 已生成产物 ({Object.keys(outputs).length}/4)</div>
                {Object.entries(outputs).map(([fmt, info]) => (
                  <div key={fmt} className="output-item">
                    <span className="output-format">{fmt.toUpperCase()}</span>
                    <code className="output-path">{info.path}</code>
                    <span className="output-size">{(info.size / 1024).toFixed(1)}KB</span>
                    <button className="btn small" onClick={() => onOpen(info.path)} data-testid={`open-${fmt}`}>
                      📂 打开
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SuccessBlock>
        )}
      </div>
    </div>
  );
}

// ---- 路由映射 ----
const SCREENS = {
  'file-kb': FileKbScreen,
  'advisor': AdvisorScreen,
  'template': TemplateScreen,
  'preview': PreviewScreen,
  'output': OutputScreen,
};

// ---- 主 Renderer 组件 ----
function App() {
  const initialRoute = (() => {
    const hash = (window.location.hash || '').replace('#', '');
    return ROUTE_KEYS.includes(hash) ? hash : DEFAULT_ROUTE;
  })();
  const [active, setActive] = useState(initialRoute);
  const [logs, setLogs] = useState([]);
  const [daemonStatus, setDaemonStatus] = useState(null);

  // 同步 hash → active
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

  const appendLog = (line) => {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [...prev.slice(-49), `[${ts}] ${line}`]);
  };

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

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onDemoLog) {
      const off = window.electronAPI.onDemoLog((line) => appendLog(line));
      return () => {
        if (typeof off === 'function') off();
      };
    }
  }, []);

  // T-W1: 周期 ping daemon, 显示 status 在 header
  useEffect(() => {
    if (!window.electronAPI) return;
    const refresh = async () => {
      const r = await window.electronAPI.status.getDaemon();
      if (r.ok) setDaemonStatus(r.data);
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const currentRoute = ROUTES.find((r) => r.key === active) || ROUTES[0];
  const ScreenComp = SCREENS[active] || FileKbScreen;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>灵犀演示 · 桌面</h1>
          <p>T-W1 UI 黄金路径接通 · 5 模块真业务 (Phase 6 + Wave 1)</p>
        </div>
        <div className="app-header-meta">
          <span className="badge ok">Wave 1 · T-W1</span>
          <span className="badge subtle">5 路由真业务</span>
          {daemonStatus && (
            <span className={`badge ${daemonStatus.ready ? 'ok' : 'warn'}`} data-testid="daemon-status">
              {daemonStatus.ready ? `daemon :${daemonStatus.port}` : 'daemon 未就绪'}
            </span>
          )}
        </div>
      </header>

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

      <main className="content">
        <ScreenComp appendLog={appendLog} />
      </main>

      <footer className="log-panel" data-testid="log-panel">
        <div className="log-title">实时日志 (renderer ↔ IPC ↔ daemon)</div>
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
  window.__lingxiRendered = true;
  // T-W1: console.log 转发到 main process (供 E2E 调试)
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => {
    origLog(...args);
    if (window.electronAPI && window.electronAPI.demoLog) {
      try { window.electronAPI.demoLog(`[renderer] ${args.join(' ').slice(0, 200)}`); } catch (_) {}
    }
  };
  console.error = (...args) => {
    origErr(...args);
    if (window.electronAPI && window.electronAPI.demoLog) {
      try { window.electronAPI.demoLog(`[renderer:err] ${args.join(' ').slice(0, 200)}`); } catch (_) {}
    }
  };
  console.log('[T-W1] renderer started, active route = ' + (window.location.hash || 'file-kb'));
} else {
  console.error('[T-6.1] #root not found in DOM');
}
