import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 聚合入口自身也会解析 Vite 配置，不能只在子项目禁用 .env* 加载。
  envDir: false,
  test: {
    // 默认入口聚合全部测试，每一类沿用自己的收集范围和运行配置。
    projects: [
      { extends: './vitest-unit.config.mts' },
      { extends: './vitest-integration.config.mts' },
      { extends: './vitest-e2e.config.mts' },
    ],
  },
});
