/**
 * Jest config for Phase 6 T-6.2 storage-real-path tests.
 *
 * 复用 apps/desktop/jest.config.js 的 ts-jest preset, 但只跑 storage-real-path.test.ts
 * (避免被 Phase 1 老 storage_persistence.test.ts 干扰 — 它用 env LINGXI_KB_ROOT
 *  mutate, 跨 test leak, 不能并行跑)
 *
 * rootDir 已经是 apps/desktop/ (此 config 文件位置), 所以路径不带前缀
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/modules/file_kb'],
  testMatch: ['<rootDir>/src/modules/file_kb/__tests__/storage-real-path*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          target: 'es2022',
          esModuleInterop: true,
          strict: false,
          skipLibCheck: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
  testTimeout: 60_000,
  // 串行 — 多个 case mock process.platform / os.homedir, 并行会互相污染
  maxWorkers: 1,
};
