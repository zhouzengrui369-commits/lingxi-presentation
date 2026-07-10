/**
 * Jest config for Phase 6 T-6.3 real-runtime-validate tests.
 *
 * 钉子 #30: 必须用专用 jest config, 避免被 apps/desktop/jest.config.js 默认 roots 干扰
 * 钉子 #4:  maxWorkers=1 串行, 不并发 (因为 harness 自身也是 max_concurrency=1)
 * 钉子 #14: 跑 test 后立刻写 deliverable.md + board, 3件齐
 *
 * rootDir 已经是 apps/desktop/ (此 config 文件位置), 所以路径不带前缀
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/cli'],
  testMatch: ['<rootDir>/cli/__tests__/test_real_runtime_validate.test.ts'],
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
  // 串行 — 多 case 共用 mock / env, 并行会互相污染
  maxWorkers: 1,
};
