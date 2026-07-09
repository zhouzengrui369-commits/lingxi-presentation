/**
 * jest.config.js for advisor unit tests (T-1.2)
 * 灵犀演示 · Phase 1
 *
 * 不用 @react-native/jest-preset — 那个 preset 是 RN runtime 用的，
 * 我们的 advisor 测试是纯逻辑，不渲染 RN 组件。
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/src/modules/advisor/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', 'e2e_live\\.test\\.ts$'],
  transform: {
    '^.+\\.tsx?$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
      ],
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testTimeout: 30000,
};
