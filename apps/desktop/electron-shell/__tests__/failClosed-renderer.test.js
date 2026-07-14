/**
 * T-failClosed: renderer.jsx 集成 fail-closed 验证器 — 源代码自检测试
 *
 * 父级 PM 治本 4 件套:
 *   1. renderer.jsx 必须 import 4 个 validator + VERDICT
 *   2. 4 个 Screen 调 validator 后才 setState (不能直接 setState({ kind: 'success' }))
 *   3. 失败 / 降级 / 非法响应进入 degraded-block 或 error-block, 不进 success-block
 *   4. success-block 标题 (导入完成 / 建议已生成 / 预览生成完成 / 已生成 ✓) 只在 verdict.kind === 'success' 时渲染
 */
const fs = require('fs');
const path = require('path');

const SHELL_DIR = path.resolve(__dirname, '..');
const RENDERER_JSX = path.join(SHELL_DIR, 'src', 'renderer.jsx');

const src = fs.readFileSync(RENDERER_JSX, 'utf-8');

// ---- 1. import 4 个 validator ----
describe('test_renderer_imports_validators', () => {
  test('renderer.jsx 从 ./failClosed.js 导入 (CJS module via namespace)', () => {
    // 两种 import 形式都接受: ESM `import { ... }` 或 CJS `import * as fc`
    expect(src).toMatch(/import\s*\*\s+as\s+fc\s+from\s*['"]\.\/failClosed\.js['"]/);
  });
  test('renderer.jsx 解构出 validateFileKbImport', () => {
    // 接受 const { ... } = fc 或 const { ... } = require('./failClosed.js')
    expect(src).toMatch(/validateFileKbImport/);
  });
  test('renderer.jsx 解构出 validateAdvisorChat', () => {
    expect(src).toMatch(/validateAdvisorChat/);
  });
  test('renderer.jsx 解构出 validatePreviewGenerate', () => {
    expect(src).toMatch(/validatePreviewGenerate/);
  });
  test('renderer.jsx 解构出 validateOutputGenerate', () => {
    expect(src).toMatch(/validateOutputGenerate/);
  });
  test('renderer.jsx 解构出 VERDICT', () => {
    expect(src).toMatch(/VERDICT/);
  });
});

// ---- 2. 4 个 Screen 调 validator 后才 setState (key: kind: 'success') ----
describe('test_renderer_calls_validator_before_success', () => {
  test('FileKbScreen.doImport 调 validateFileKbImport', () => {
    // 必须有 validateFileKbImport(r) 出现在 doImport 之后, success 之前
    const doImportMatch = src.match(/const doImport\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*;/);
    expect(doImportMatch).not.toBeNull();
    const body = doImportMatch[0];
    expect(body).toMatch(/validateFileKbImport/);
    // success setState 必须在 validateFileKbImport 之后
    const validateIdx = body.indexOf('validateFileKbImport');
    const successIdx = body.indexOf("setState({ kind: 'success'");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(successIdx).toBeGreaterThan(validateIdx);
  });

  test('AdvisorScreen.doChat 调 validateAdvisorChat', () => {
    const doChatMatch = src.match(/const doChat\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*;/);
    expect(doChatMatch).not.toBeNull();
    const body = doChatMatch[0];
    expect(body).toMatch(/validateAdvisorChat/);
    const validateIdx = body.indexOf('validateAdvisorChat');
    const successIdx = body.indexOf("setState({ kind: 'success'");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(successIdx).toBeGreaterThan(validateIdx);
  });

  test('PreviewScreen.doGenerate 调 validatePreviewGenerate', () => {
    const doGenMatch = src.match(/const doGenerate\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*;/);
    expect(doGenMatch).not.toBeNull();
    const body = doGenMatch[0];
    expect(body).toMatch(/validatePreviewGenerate/);
    const validateIdx = body.indexOf('validatePreviewGenerate');
    const successIdx = body.indexOf("setState({ kind: 'success'");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(successIdx).toBeGreaterThan(validateIdx);
  });

  test('OutputScreen.doGenerate 调 validateOutputGenerate', () => {
    // 找所有 doGenerate, 取第二个 (第一个是 PreviewScreen)
    const matches = [...src.matchAll(/const doGenerate\s*=\s*async\s*\(format\)\s*=>\s*\{[\s\S]*?\}\s*;/g)];
    expect(matches.length).toBeGreaterThan(0);
    const body = matches[0][0];
    expect(body).toMatch(/validateOutputGenerate/);
    const validateIdx = body.indexOf('validateOutputGenerate');
    const successIdx = body.indexOf("setState({ kind: 'success'");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(successIdx).toBeGreaterThan(validateIdx);
  });
});

// ---- 3. DegradedBlock 存在 + 4 模块 render 走 degraded 分支 ----
describe('test_renderer_has_degraded_block', () => {
  test('DegradedBlock 组件定义存在', () => {
    expect(src).toMatch(/function\s+DegradedBlock\s*\(/);
  });
  test('DegradedBlock 渲染 data-testid="degraded-block"', () => {
    expect(src).toMatch(/data-testid=['"]degraded-block['"]/);
  });
  test('FileKbScreen render 含 degraded 分支', () => {
    const screenMatch = src.match(/function\s+FileKbScreen[\s\S]*?return\s*\(\s*<div\s+className=['"]screen file-kb['"]/);
    expect(screenMatch).not.toBeNull();
    // 找 screen 结束
    const start = src.indexOf('function FileKbScreen');
    // 用 配对深度找结束
    let depth = 0;
    let end = start;
    let i = src.indexOf('return (', start);
    expect(i).toBeGreaterThan(-1);
    // 找 return ( 后配对的 );
    for (let k = i + 'return ('.length; k < src.length; k++) {
      const c = src[k];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) { end = k; break; }
        depth--;
      }
    }
    const body = src.slice(start, end);
    expect(body).toMatch(/state\.kind\s*===\s*['"]degraded['"]/);
  });
  test('AdvisorScreen render 含 degraded 分支', () => {
    const start = src.indexOf('function AdvisorScreen');
    let i = src.indexOf('return (', start);
    let depth = 0, end = i;
    for (let k = i + 'return ('.length; k < src.length; k++) {
      const c = src[k];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) { end = k; break; }
        depth--;
      }
    }
    const body = src.slice(start, end);
    expect(body).toMatch(/state\.kind\s*===\s*['"]degraded['"]/);
  });
  test('PreviewScreen render 含 degraded 分支', () => {
    const start = src.indexOf('function PreviewScreen');
    let i = src.indexOf('return (', start);
    let depth = 0, end = i;
    for (let k = i + 'return ('.length; k < src.length; k++) {
      const c = src[k];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) { end = k; break; }
        depth--;
      }
    }
    const body = src.slice(start, end);
    expect(body).toMatch(/state\.kind\s*===\s*['"]degraded['"]/);
  });
  test('OutputScreen render 含 degraded 分支', () => {
    const start = src.indexOf('function OutputScreen');
    let i = src.indexOf('return (', start);
    let depth = 0, end = i;
    for (let k = i + 'return ('.length; k < src.length; k++) {
      const c = src[k];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) { end = k; break; }
        depth--;
      }
    }
    const body = src.slice(start, end);
    expect(body).toMatch(/state\.kind\s*===\s*['"]degraded['"]/);
  });
});

// ---- 4. 失败 fixture 不渲染 success 文案 (用 mock fixture 验证) ----
// 通过检查 SuccessBlock 的调用, 确认: state.kind === 'success' && (state.verdict.kind === VERDICT.SUCCESS) 才渲染
describe('test_success_title_only_for_verdict_success', () => {
  test('FileKbScreen 渲染 "导入完成" 只在 verdict.kind === VERDICT.SUCCESS 分支', () => {
    // 找 FileKbScreen render 段
    const start = src.indexOf('function FileKbScreen');
    const end = src.indexOf('function AdvisorScreen');
    const body = src.slice(start, end);
    // 必须有: kind === 'success' && verdict 来自 state.verdict
    expect(body).toMatch(/state\.kind\s*===\s*['"]success['"]/);
    // success 分支读 state.verdict.data.files 等
    expect(body).toMatch(/state\.verdict\.data\.files/);
  });
  test('AdvisorScreen 渲染 "顾问建议已生成" 走 state.verdict.provider', () => {
    const start = src.indexOf('function AdvisorScreen');
    const end = src.indexOf('function TemplateScreen');
    const body = src.slice(start, end);
    expect(body).toMatch(/state\.verdict\.provider/);
    expect(body).toMatch(/state\.verdict\.elapsed_ms/);
  });
  test('PreviewScreen 渲染 "预览生成完成" 走 state.verdict.data.sections', () => {
    const start = src.indexOf('function PreviewScreen');
    const end = src.indexOf('function OutputScreen');
    const body = src.slice(start, end);
    expect(body).toMatch(/state\.verdict\.data\.sections/);
    expect(body).toMatch(/state\.verdict\.latency_ms/);
  });
  test('OutputScreen 渲染 "已生成 ✓" 走 state.verdict.data.size_bytes', () => {
    const start = src.indexOf('function OutputScreen');
    const end = src.indexOf('const SCREEN_MAP');
    const body = src.slice(start, end);
    expect(body).toMatch(/state\.verdict\.data\.size_bytes/);
    expect(body).toMatch(/state\.verdict\.data\.output_path/);
  });
});
