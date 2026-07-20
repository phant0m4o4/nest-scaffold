import { defineConfig } from 'vitest/config';
import config from './vitest.config';

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ['src/**/*.e2e-spec.ts'],
    // testcontainers 拉起真实容器，放宽钩子与用例超时
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
