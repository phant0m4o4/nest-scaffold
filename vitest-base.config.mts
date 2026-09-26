import { resolve } from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    env: {
      NODE_ENV: 'test',
    },
  },
  plugins: [
    // 编译装饰器元数据；显式使用 ESM，避免继承生产构建的 CommonJS 配置。
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
});
