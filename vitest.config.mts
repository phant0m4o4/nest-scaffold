import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 默认入口聚合全部测试，每一类沿用自己的收集范围和运行配置。
    projects: [
      { extends: './vitest-unit.config.mts' },
      { extends: './vitest-integration.config.mts' },
      { extends: './vitest-e2e.config.mts' },
    ],
  },
});
