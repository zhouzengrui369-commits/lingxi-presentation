/**
 * File KB Module — T-1.1
 *
 * 公共 API 入口（业务代码 + RN UI 都从这个文件导入）。
 *
 *   - RN UI 默认导出 FileKbScreen（真实按钮 + 7 格式状态 + Wiki 列表）
 *   - 业务 API（FileKbManager + 各子模块）从 manager.ts 导入
 *
 * 灵犀演示 · Phase 1 · T-1.1
 */

// ---- RN UI（default export） ----
export { default } from './FileKbScreen.tsx';
export { default as FileKbScreen } from './FileKbScreen.tsx';

// ---- 业务 API（runtime） ----
export {
  FileKbManager,
  expandPaths,
  FILE_KB_MODULE_VERSION,
  KbStorage,
  kbRootExists,
  resolveKbRoot,
  importSingleFile,
  SUPPORTED_FORMATS,
  detectFormat,
  organizeToWiki,
  linkKb,
  tokenize,
  toSuggestions,
  suggestRelatedFiles,
} from './manager.ts';

// ---- 业务 API（type-only） ----
export type {
  WikiKbEntry,
  FileImportRecord,
  ImportResult,
  SupportedFormat,
  WikiOptions,
  KbLinkResult,
  KbLinkOptions,
  Suggestion,
  ImportOptions,
  BatchResult,
  ImportStage,
} from './manager.ts';
