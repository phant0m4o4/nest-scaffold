import { defineConfig } from 'vitest/config';
import baseConfig from './vitest-base.config.mjs';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    name: 'integration',
    include: ['src/**/*.integration-spec.ts'],
    // 集成测试会通过 testcontainers 拉起真实依赖。
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
