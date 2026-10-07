import { describe, expect, it } from 'vitest';

describe('测试配置隔离', () => {
  it.each([
    ['vitest.config.mts', () => import('../../vitest.config.mjs')],
    ['vitest-base.config.mts', () => import('../../vitest-base.config.mjs')],
    ['vitest-unit.config.mts', () => import('../../vitest-unit.config.mjs')],
    [
      'vitest-integration.config.mts',
      () => import('../../vitest-integration.config.mjs'),
    ],
    ['vitest-e2e.config.mts', () => import('../../vitest-e2e.config.mjs')],
  ] as const)(
    '%s 应禁止自动加载本地环境文件',
    async (_filename, loadConfig) => {
      const config = await loadConfig();

      expect(config.default.envDir).toBe(false);
    },
  );
});
