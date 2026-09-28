import { defineConfig } from 'vitest/config';
import baseConfig from './vitest-base.config.mjs';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    name: 'e2e',
    // 真正的 E2E 只允许从完整应用的外部边界验证，不得自行拼装 Nest 测试模块。
    include: ['test/e2e/**/*.e2e-spec.ts'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
