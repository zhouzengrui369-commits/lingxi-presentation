/**
 * test_template_export_schema — analyze 输出严格匹配 contracts/template_style.schema.json
 *
 * 用 jsonschema (Draft 2020-12 + FormatChecker) 实跑校验。
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { analyzeHeuristic } from '../pptx_extract';
import { BUILTIN_LIGHT, BUILTIN_DARK } from '../builtin_themes';
import { TEMPLATES } from './fixtures';

const SCHEMA_PATH = (() => {
  // try a few candidates — robust to ts-jest vs tsx vs node differences
  const candidates = [
    resolve(__dirname, '..', '..', '..', '..', '..', '..', 'contracts', 'template_style.schema.json'),
    resolve(__dirname, '..', '..', '..', '..', '..', 'contracts', 'template_style.schema.json'),
    resolve(__dirname, '..', '..', '..', '..', 'contracts', 'template_style.schema.json'),
  ];
  const fs = require('node:fs');
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
})();

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
const validate = ajv.compile(schema);

function exportBuiltinAsAnalyzeResult(theme: typeof BUILTIN_LIGHT) {
  return {
    template_id: theme.template_id,
    source: 'builtin' as const,
    name: theme.name,
    layout_types: theme.layout_types,
    palette: theme.palette,
    fonts: theme.fonts,
    decorations: theme.decorations,
    page_count: 5,
    analyzed_at: new Date().toISOString(),
    analyzer_version: theme.analyzer_version,
  };
}

describe('template_export_schema', () => {
  it('schema 文件本身合法', () => {
    expect(() => ajv.compile(schema)).not.toThrow();
  });

  for (const [name, path] of Object.entries(TEMPLATES)) {
    it(`analyze ${name} 输出匹配 template_style.schema.json`, () => {
      const r = analyzeHeuristic(path);
      const ok = validate(r);
      if (!ok) {
        // 打印详细错误便于调试
        // eslint-disable-next-line no-console
        console.error('ajv errors:', JSON.stringify(validate.errors, null, 2));
      }
      expect(ok).toBe(true);
      expect(r.source).toBe('imported');
      expect(r.template_id).toMatch(/^imported_[0-9a-f]{8}$/);
    });
  }

  it('builtin light theme 输出也匹配 schema', () => {
    const r = exportBuiltinAsAnalyzeResult(BUILTIN_LIGHT);
    const ok = validate(r);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error('builtin light ajv errors:', JSON.stringify(validate.errors, null, 2));
    }
    expect(ok).toBe(true);
    expect(r.source).toBe('builtin');
  });

  it('builtin dark theme 输出也匹配 schema', () => {
    const r = exportBuiltinAsAnalyzeResult(BUILTIN_DARK);
    const ok = validate(r);
    expect(ok).toBe(true);
  });

  it('palette.primary 必须是 #RRGGBB 格式（schema pattern）', () => {
    const r = analyzeHeuristic(TEMPLATES.businessDark);
    expect(r.palette.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('analyzer_version 必须是 semver', () => {
    const r = analyzeHeuristic(TEMPLATES.businessDark);
    expect(r.analyzer_version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  });
});
