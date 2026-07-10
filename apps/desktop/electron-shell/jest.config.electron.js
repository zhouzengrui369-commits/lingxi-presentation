/**
 * Jest config for Electron shell packaging tests.
 * 灵犀演示 · Phase 6 · T-6.4 (binary naming unify)
 *
 * Runs in apps/desktop/electron-shell/ — different scope from
 * root jest.config.js (which is for file_kb module tests).
 *
 * Uses ts-jest with isolatedModules to avoid pulling in full
 * RN/RN-cli type graph from apps/desktop/ root.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  roots: ['<rootDir>/__tests__'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testTimeout: 15000,
  globals: {
    'ts-jest': {
      isolatedModules: true,
      diagnostics: false,
    },
  },
};
