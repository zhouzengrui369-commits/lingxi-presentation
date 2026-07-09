/**
 * Jest config for file_kb module tests.
 * 灵犀演示 · Phase 1 · T-1.1
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/desktop/src/modules/file_kb'],
  testMatch: ['<rootDir>/apps/desktop/src/modules/file_kb/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testTimeout: 30000,
  globals: {
    'ts-jest': {
      isolatedModules: true,
      diagnostics: false,
    },
  },
};