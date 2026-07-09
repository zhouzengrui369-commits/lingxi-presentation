/**
 * 独立 jest 配置 — preview 模块单测（T-1.4）
 * 用 babel-jest + node 环境（预览逻辑为框架无关的纯 TS，不依赖 RN preset）。
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src/modules/preview'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'babel-jest',
      { configFile: require.resolve('./babel.config.js') },
    ],
  },
};
