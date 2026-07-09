/**
 * Jest config for T-1.3 template module tests.
 *
 * 与根 jest.config.js (RN preset) 解耦 — template 模块的测试是纯 Node + TS，
 * 不需要 RN babel/metro；用 ts-jest 直接转译。
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'es2022', esModuleInterop: true, strict: false, skipLibCheck: true, resolveJsonModule: true } }],
  },
  testTimeout: 60_000,
};
