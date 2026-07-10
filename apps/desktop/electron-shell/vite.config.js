/**
 * Vite config for Electron renderer bundle.
 *
 * 灵犀演示 · Phase 6 · T-6.1
 *
 * 把 React 5-route renderer 编译到 dist/renderer.bundle.js，
 * renderer.html 加载该 bundle 到 #root 容器。
 *
 * 目标: Electron BrowserWindow (Chromium) 渲染 5 大 P0 模块
 * 约束: 不依赖 react-native (那套 screens 有 Node fs / os 依赖, 浏览器跑不了)
 *       改用 web-native React (react-dom) 渲染 5 路由占位 + 简单交互
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: false, // 保留 dist/ 里已有的 electron-builder 产物
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer.jsx'),
      output: {
        entryFileNames: 'renderer.bundle.js',
        format: 'iife',
        // IIFE 格式不需要 ES module, BrowserWindow 直接当 script 跑
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
    sourcemap: false,
    target: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
  logLevel: 'warn',
});
