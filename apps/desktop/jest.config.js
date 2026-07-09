/**
 * Jest config for T-1.1 file_kb module tests.
 *
 * 与 RN 0.86 兼容：RN 0.86 移除了 @react-native/jest-preset，
 * 改用 react-native package 内置 preset 或纯 ts-jest (file_kb 测试是纯 Node + TS，
 * 不渲染 RN 组件)。
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
