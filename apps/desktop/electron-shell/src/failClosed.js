/**
 * Fail-closed 验证器: 5 路由 renderer.jsx 在显示成功之前必须先调用本模块。
 *
 * 父级 PM 真机验收发现 4 个 false-green 场景 (work/tasks/2026-07-14-parent-pm-mvp-gate/PM_COMPUTER_USE_EVIDENCE.md):
 *   1. file-kb import — daemon unavailable 时仍显示"导入完成" (data.files=0, data.entries=0)
 *   2. advisor chat   — provider=undefined, 0ms 仍显示"建议已生成"
 *   3. preview        — fell_back=true, provider=mock, 0ms 仍显示"预览生成完成"
 *   4. output         — status=failed, size_bytes=0, path missing 仍显示".pptx 已生成 ✓"
 *
 * 设计:
 *   - 4 个纯函数, 不依赖 React / DOM / electron, 易于 jest node 环境单测
 *   - 每个函数返回 { kind, reason, ... }, kind ∈ { 'success' | 'degraded' | 'failed' | 'invalid' }
 *     - 'success'  = 真正成功, 可以进 SuccessBlock
 *     - 'degraded' = 降级 (mock / fell_back / unavailable), 走 DegradedBlock
 *     - 'failed'   = 业务错误, 走 ErrorBlock
 *     - 'invalid'  = 响应畸形 / 关键字段缺失 / 时延为 0 (疑似未真活), 走 ErrorBlock
 *   - 永不把 mock / fallback / undefined / 0B / 缺失路径 视为 success
 *
 * 复用方:
 *   apps/desktop/electron-shell/src/renderer.jsx — 5 路由 Screen 调这里再做 state transition
 *   apps/desktop/electron-shell/__tests__/failClosed.test.js — 4 个 false-green 场景 + 1 个 happy path
 *
 * Module format: CommonJS (兼容 jest node testEnvironment + Vite ESM import via default+namespace)
 *  - 单元测试: const fc = require('../src/failClosed.js'); fc.validateFileKbImport(r);
 *  - Vite import: import * as fc from './failClosed.js' or import fc from './failClosed.js';
 */

const VERDICT = Object.freeze({
  SUCCESS: 'success',
  DEGRADED: 'degraded',
  FAILED: 'failed',
  INVALID: 'invalid',
});

// 通用工具
function _isMissing(v) {
  return v === undefined || v === null;
}

function _isEmptyString(v) {
  return v === undefined || v === null || v === '';
}

function _isZeroOrLess(n) {
  return typeof n !== 'number' || Number.isNaN(n) || n <= 0;
}

// 父级 PM 规则: provider 出现以下任一值都算降级 (mock / unavailable / 空)
function _isDegradedProvider(provider) {
  if (_isMissing(provider)) return true; // undefined 视同降级 (advisor 场景)
  if (typeof provider !== 'string') return true;
  const p = provider.toLowerCase();
  return p === 'mock' || p === 'unavailable' || p === '' || p === 'none';
}

// 父级 PM 规则: fell_back=true 视同降级 (preview 场景)
function _isFellBack(v) {
  return v === true;
}

// ---- 【REWORK 02 治本】章节正文 placeholder 检测 (preview 场景) ----
// 父级 PM 第二次验收证据 (Wave 6): 5/5 sections 内容均为 `（章节超时: fetch failed）`,
// 旧 validator 只检查 sections.length>0, 即便所有章节都是占位符仍判 success → false-green.
//
// 真实占位符来源 (apps/desktop/cli/preview.ts:113, 122):
//   - HTTP 非 200:  `<p class="lx-muted">（章节生成失败: HTTP ${status}）</p>`
//   - 超时/抓取失败: `<p class="lx-muted">（章节超时: ${e.message}）</p>`
//     e.message 在 Node fetch 失败时常为 "fetch failed".
//
// 检测策略 (保守, 不误杀真活 LLM 输出):
//   1. 章节对象本身必须存在, 含 heading/content_html/image_urls 三字段
//   2. content_html 去除 HTML 标签后 innerText 非空
//   3. innerText 不命中以下 placeholder 模式 (任一命中 → 判无效):
//      - 含 "章节超时" / "章节生成失败" (真实占位符特征短语)
//      - 含 "fetch failed" / "fetch error" (Node fetch 异常 message, 忽略大小写)
//      - 含 "lx-muted" (占位符渲染时的 CSS class 标记, 强信号)
const SECTION_PLACEHOLDER_PATTERNS = [
  /章节超时/,
  /章节生成失败/,
  /fetch\s+failed/i,
  /fetch\s+error/i,
  /lx-muted/,
];

function _stripHtml(html) {
  if (typeof html !== 'string') return '';
  // 粗略 innerText 提取: 去标签 + 解常见 entity + trim
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function _isSectionContentValid(section) {
  if (!section || typeof section !== 'object') {
    return { ok: false, reason: 'section 不是对象' };
  }
  // 必备字段
  if (typeof section.heading !== 'string' || section.heading.trim().length === 0) {
    return { ok: false, reason: 'section.heading 缺失或空' };
  }
  if (typeof section.content_html !== 'string') {
    return { ok: false, reason: 'section.content_html 不是字符串' };
  }
  if (!Array.isArray(section.image_urls)) {
    return { ok: false, reason: 'section.image_urls 不是数组' };
  }
  // innerText 提取
  const text = _stripHtml(section.content_html);
  if (text.length === 0) {
    return { ok: false, reason: 'section.content_html innerText 为空' };
  }
  // placeholder 模式匹配
  for (const re of SECTION_PLACEHOLDER_PATTERNS) {
    if (re.test(section.content_html) || re.test(text)) {
      return { ok: false, reason: `section.content_html 命中占位符模式 ${re.source}` };
    }
  }
  return { ok: true };
}

function _allSectionsValid(sections) {
  if (!Array.isArray(sections)) {
    return { ok: false, reason: 'sections 不是数组' };
  }
  if (sections.length === 0) {
    return { ok: false, reason: 'sections 是空数组' };
  }
  for (let i = 0; i < sections.length; i++) {
    const v = _isSectionContentValid(sections[i]);
    if (!v.ok) {
      return {
        ok: false,
        reason: `第 ${i + 1}/${sections.length} 章节无效: ${v.reason}`,
        invalidIndex: i,
      };
    }
  }
  return { ok: true };
}

// ---- 1. file_kb_import 验证 ----
// 【W3 真实合同】/v1/import 实际返 (backend/daemon/server.py:326-339):
//   {
//     "status": "ok",
//     "data": {
//       "ok": true,
//       "files": [],          // ARRAY of file names (从 cli/import-5-files-to-kb.ts 返)
//       "entries": [],        // ARRAY of wiki entry names
//       "failed": [],
//       "kb_root": "/tmp/lingxi_kb",
//       "elapsed_ms": 0,
//       ...
//     },
//     "provider_status": "live" | "api" | "mock" | "unavailable",
//     "fell_back": false,
//   }
// 经 w1FetchJson (main.js) wrap 后, renderer 收到:
//   { ok: true, data: <inner data>, latency_ms: N }
//
// 父级 PM false-green (daemon unavailable 时 0 文件):
//   { ok: true, data: { files: [], entries: [], ... }, latency_ms: 12 }
//
// PM REPAIR (2026-07-14): 必须接受 array 形态 (files.length>0 判成功),
// 同时保留 numeric 形态兼容 (files>0 判成功, 防止 upstream 改动回归)。
function _isNonEmptyFiles(v) {
  // array: length>0; number: >0; 其它: false
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return v > 0;
  return false;
}

function _filesCount(v) {
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'number') return v;
  return 0;
}

function validateFileKbImport(resp) {
  if (!resp || typeof resp !== 'object') {
    return { kind: VERDICT.INVALID, reason: '响应不是对象', raw: resp };
  }
  if (resp.ok !== true) {
    return { kind: VERDICT.FAILED, reason: 'IPC 返回 ok=false', raw: resp };
  }
  if (!resp.data || typeof resp.data !== 'object') {
    return { kind: VERDICT.INVALID, reason: 'data 缺失或不是对象', raw: resp };
  }
  const files = resp.data.files;
  const entries = resp.data.entries;
  if (files === undefined || files === null) {
    return { kind: VERDICT.INVALID, reason: 'data.files 缺失', raw: resp };
  }
  if (!_isNonEmptyFiles(files)) {
    // files=[] (空数组) 或 files=0 (零数值) 都是没有文件被导入, fail-closed
    return {
      kind: VERDICT.INVALID,
      reason: `data.files 空 (length=${Array.isArray(files) ? files.length : files}), 没有文件被导入`,
      raw: resp,
    };
  }
  if (_isZeroOrLess(resp.latency_ms)) {
    return { kind: VERDICT.INVALID, reason: 'latency_ms=0 或缺失, 疑似未真活', raw: resp };
  }
  return {
    kind: VERDICT.SUCCESS,
    data: resp.data,
    latency_ms: resp.latency_ms,
    reason: `导入 ${_filesCount(files)} 文件, ${Array.isArray(entries) ? entries.length : (entries ?? 0)} wiki 条目`,
  };
}

// ---- 2. advisor_chat 验证 ----
// 期望响应:
//   { ok: true, data: { content: "...", provider: "openai|ps|cli", fell_back: false, elapsed_ms: N>0 }, provider: "...", elapsed_ms: N }
// 父级 PM false-green:
//   { ok: true, data: { content: "hello (mock)", provider: "undefined" }, provider: "undefined", elapsed_ms: 0 }
function validateAdvisorChat(resp) {
  if (!resp || typeof resp !== 'object') {
    return { kind: VERDICT.INVALID, reason: '响应不是对象', raw: resp };
  }
  if (resp.ok !== true) {
    return { kind: VERDICT.FAILED, reason: 'IPC 返回 ok=false', raw: resp };
  }
  if (!resp.data || typeof resp.data !== 'object') {
    return { kind: VERDICT.INVALID, reason: 'data 缺失或不是对象', raw: resp };
  }
  if (_isEmptyString(resp.data.content)) {
    return { kind: VERDICT.INVALID, reason: 'data.content 缺失', raw: resp };
  }
  // 兼容: provider 可能在 data 上, 也可能在顶层
  const provider = resp.data.provider ?? resp.provider;
  if (_isDegradedProvider(provider)) {
    return {
      kind: VERDICT.DEGRADED,
      reason: `provider=${String(provider)}, 走 mock/unavailable 降级`,
      raw: resp,
      provider: String(provider),
    };
  }
  const fellBack = resp.data.fell_back ?? resp.fell_back;
  if (_isFellBack(fellBack)) {
    return {
      kind: VERDICT.DEGRADED,
      reason: 'fell_back=true, LLM 降级过',
      raw: resp,
      provider,
      fellBack: true,
    };
  }
  const elapsed = resp.data.elapsed_ms ?? resp.elapsed_ms ?? resp.latency_ms;
  if (_isZeroOrLess(elapsed)) {
    return {
      kind: VERDICT.INVALID,
      reason: 'elapsed_ms=0 或缺失, 疑似未真活',
      raw: resp,
      provider,
    };
  }
  return {
    kind: VERDICT.SUCCESS,
    data: resp.data,
    provider,
    elapsed_ms: elapsed,
    reason: `provider=${provider}, ${elapsed}ms`,
  };
}

// ---- 3. preview_generate 验证 ----
// 期望响应:
//   { ok: true, data: { sections: [...], section_count: 5, provider: "openai|ps|cli", fell_back: false, latency_ms: N>0 } }
// 父级 PM false-green:
//   { ok: true, data: { sections: [5 项], section_count: 5, provider: "mock", fell_back: true, latency_ms: 0 } }
function validatePreviewGenerate(resp) {
  if (!resp || typeof resp !== 'object') {
    return { kind: VERDICT.INVALID, reason: '响应不是对象', raw: resp };
  }
  if (resp.ok !== true) {
    return { kind: VERDICT.FAILED, reason: 'IPC 返回 ok=false', raw: resp };
  }
  if (!resp.data || typeof resp.data !== 'object') {
    return { kind: VERDICT.INVALID, reason: 'data 缺失或不是对象', raw: resp };
  }
  if (!Array.isArray(resp.data.sections)) {
    return { kind: VERDICT.INVALID, reason: 'data.sections 不是数组', raw: resp };
  }
  if (resp.data.sections.length === 0) {
    return { kind: VERDICT.INVALID, reason: 'data.sections 是空数组', raw: resp };
  }
  // 【REWORK 02 治本】逐章节正文校验, 失败/超时占位符 fail-closed
  // 父级 PM 第二次验收证据: 5/5 sections 内容均为 `（章节超时: fetch failed）` 仍判 success → false-green
  // 现在即使 sections.length>0 + provider/latency 表面正常, 章节占位符仍判 invalid
  const sectionCheck = _allSectionsValid(resp.data.sections);
  if (!sectionCheck.ok) {
    return {
      kind: VERDICT.INVALID,
      reason: sectionCheck.reason,
      raw: resp,
      invalidSectionIndex: sectionCheck.invalidIndex,
    };
  }
  const provider = resp.data.provider;
  const fellBack = resp.data.fell_back;
  const latency = resp.data.latency_ms ?? resp.latency_ms;
  // 1) fell_back 优先 (不管 provider)
  if (_isFellBack(fellBack)) {
    return {
      kind: VERDICT.DEGRADED,
      reason: 'fell_back=true, preview 走降级 (mock 或回退路径)',
      raw: resp,
      provider,
      fellBack: true,
    };
  }
  // 2) provider 显式 mock / unavailable
  if (_isDegradedProvider(provider)) {
    return {
      kind: VERDICT.DEGRADED,
      reason: `provider=${String(provider)}, preview 走 mock`,
      raw: resp,
      provider: String(provider),
    };
  }
  // 3) latency=0 疑似未真活
  if (_isZeroOrLess(latency)) {
    return {
      kind: VERDICT.INVALID,
      reason: 'latency_ms=0 或缺失, 疑似未真活',
      raw: resp,
      provider,
    };
  }
  return {
    kind: VERDICT.SUCCESS,
    data: resp.data,
    provider,
    latency_ms: latency,
    reason: `${resp.data.sections.length} 章节, ${latency}ms`,
  };
}

// ---- 4. output_generate 验证 ----
// 【W3 真实合同】/v1/output 实际返 (backend/daemon/server.py:474-510):
//   成功: { "status": "ok", "format": "pdf", "output_path": "...",
//            "size_bytes": N, "elapsed_ms": N,
//            "provider_status": "api"|"mock"|"unavailable", "fell_back": false }
//   失败: { "status": "failed", "format": "pdf", "output_path": "...",
//            "size_bytes": 0, "elapsed_ms": 30000,
//            "error": "...", "provider_status": "...", "fell_back": true }
// 经 w1FetchJson (main.js) wrap 后, renderer 收到:
//   { ok: true, data: <inner payload>, latency_ms: N }
//
// 父级 PM false-green (status=failed, size=0, path="?"):
//   { ok: true, data: { status: "failed", size_bytes: 0, output_path: "?" }, latency_ms: 0 }
//
// PM REPAIR (2026-07-14):
//   - status ∈ {ok, success} 才是 success (failed/error → failed; 其它 → invalid)
//   - 用 provider_status + fell_back 判定 (不是 provider 字段)
//   - provider_status ∈ {api, live} 且 fell_back=false → success
//   - provider_status ∈ {mock, unavailable} 或 fell_back=true → degraded
//   - 未知 status (既不是 ok/success, 也不是 failed/error) → invalid
const OUTPUT_SUCCESS_STATUS = new Set(['ok', 'success']);
const OUTPUT_FAILED_STATUS = new Set(['failed', 'error']);
const OUTPUT_LIVE_PROVIDER = new Set(['api', 'live']);
const OUTPUT_DEGRADED_PROVIDER = new Set(['mock', 'unavailable']);

function validateOutputGenerate(resp) {
  if (!resp || typeof resp !== 'object') {
    return { kind: VERDICT.INVALID, reason: '响应不是对象', raw: resp };
  }
  if (resp.ok !== true) {
    return { kind: VERDICT.FAILED, reason: 'IPC 返回 ok=false', raw: resp };
  }
  if (!resp.data || typeof resp.data !== 'object') {
    return { kind: VERDICT.INVALID, reason: 'data 缺失或不是对象', raw: resp };
  }
  // 1) status 字段先判 (PM REPAIR 关键: 用真实枚举值)
  const status = resp.data.status;
  if (status === undefined || status === null) {
    return { kind: VERDICT.INVALID, reason: 'data.status 缺失', raw: resp };
  }
  if (OUTPUT_FAILED_STATUS.has(status)) {
    return {
      kind: VERDICT.FAILED,
      reason: `data.status=${status}, 生成失败`,
      raw: resp,
    };
  }
  if (!OUTPUT_SUCCESS_STATUS.has(status)) {
    // 未知 status (既不是 ok/success, 也不是 failed/error) — fail-closed
    return {
      kind: VERDICT.INVALID,
      reason: `data.status=${JSON.stringify(status)} 未知, 期望 ok|success|failed|error`,
      raw: resp,
    };
  }
  // 2) status 是 ok/success, 检查产物完整性
  if (_isEmptyString(resp.data.output_path) || resp.data.output_path === '?') {
    return { kind: VERDICT.INVALID, reason: 'output_path 缺失或为 "?"', raw: resp };
  }
  if (_isZeroOrLess(resp.data.size_bytes)) {
    return {
      kind: VERDICT.INVALID,
      reason: 'size_bytes=0 或缺失, 没有产物生成',
      raw: resp,
    };
  }
  // 3) provider_status + fell_back 联合判 (PM REPAIR: 不看 provider 字段)
  const providerStatus = resp.data.provider_status;
  const fellBack = resp.data.fell_back === true;
  if (fellBack) {
    return {
      kind: VERDICT.DEGRADED,
      reason: `fell_back=true (provider_status=${String(providerStatus)}), 生成走过降级`,
      raw: resp,
      provider_status: String(providerStatus),
      fell_back: true,
    };
  }
  if (providerStatus === undefined || providerStatus === null) {
    return {
      kind: VERDICT.INVALID,
      reason: 'data.provider_status 缺失',
      raw: resp,
    };
  }
  if (OUTPUT_DEGRADED_PROVIDER.has(providerStatus)) {
    return {
      kind: VERDICT.DEGRADED,
      reason: `provider_status=${providerStatus}, 走 mock/unavailable 降级`,
      raw: resp,
      provider_status: providerStatus,
    };
  }
  if (!OUTPUT_LIVE_PROVIDER.has(providerStatus)) {
    // 未知 provider_status (不是 api/live/mock/unavailable) — fail-closed
    return {
      kind: VERDICT.INVALID,
      reason: `data.provider_status=${JSON.stringify(providerStatus)} 未知, 期望 api|live|mock|unavailable`,
      raw: resp,
    };
  }
  // 4) 全部通过 → success
  return {
    kind: VERDICT.SUCCESS,
    data: resp.data,
    reason: `${resp.data.size_bytes}B, path=${resp.data.output_path}, provider_status=${providerStatus}`,
  };
}

module.exports = {
  VERDICT,
  validateFileKbImport,
  validateAdvisorChat,
  validatePreviewGenerate,
  validateOutputGenerate,
  // 工具 (测试用, 不强制)
  _isMissing,
  _isEmptyString,
  _isZeroOrLess,
  _isDegradedProvider,
  _isFellBack,
};
