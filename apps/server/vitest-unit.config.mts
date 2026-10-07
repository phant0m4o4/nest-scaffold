import { defineConfig } from 'vitest/config';
import baseConfig from './vitest-base.config.mjs';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    name: 'unit',
    include: ['src/**/*.unit-spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // 防倒退基线：贴近当前实际覆盖率并保留少量波动空间。
      thresholds: {
        statements: 40,
        branches: 37,
        functions: 40,
        lines: 40,
      },
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.unit-spec.ts',
        'src/**/*.integration-spec.ts',
        'src/**/*.e2e-spec.ts',
        'src/**/__tests__/**',
        'src/**/*.module.ts',
        'src/main.ts',
        'src/**/*.d.ts',
        'src/database/**',
        'src/i18n/**',
      ],
    },
  },
});
