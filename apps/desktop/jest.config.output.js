/**
 * Jest config for T-1.5 output module tests.
 * 复用 ts-jest + Node 环境（与 T-1.3 template 一致）。
 *
 * 注：pptxgenjs 在 write() 时使用 dynamic import() 加载 node-only deps（fs/path），
 *     jest 默认 VM 不支持 dynamic import callback，需开启 --experimental-vm-modules。
 *     docx 包同样在打包时使用 dynamic import。
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src/modules/output'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'es2022', esModuleInterop: true, strict: false, skipLibCheck: true, resolveJsonModule: true } }],
  },
  testTimeout: 60_000,
  // 允许 dynamic import callback（pptxgenjs / docx 内部用）
  globals: {},
};