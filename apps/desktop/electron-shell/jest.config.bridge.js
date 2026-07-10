/**
 * Jest config for T-6.1 Electron ↔ RN renderer bridge tests.
 * 灵犀演示 · Phase 6
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/..'],
  testMatch: ['<rootDir>/__tests__/**/*.test.{js,jsx,ts,tsx}'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
  testTimeout: 30000,
  // 不需要 ts-jest (测试用 JS 写)
};
