import { resolve } from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    root: './',
    env: {
      // Vitest 不会自动注入 NODE_ENV，显式设为 test
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // 防倒退基线（当前约 10%/4%/11%/10%），随覆盖提升逐步上调
      thresholds: {
        statements: 9,
        branches: 4,
        functions: 10,
        lines: 9,
      },
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
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
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      // Ensure Vitest correctly resolves TypeScript path aliases
      '@': resolve(__dirname, './src'),
    },
  },
});
