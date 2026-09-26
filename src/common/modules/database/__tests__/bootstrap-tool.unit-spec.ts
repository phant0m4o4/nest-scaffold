import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/core')>();
  return {
    ...actual,
    NestFactory: {
      ...actual.NestFactory,
      createApplicationContext: vi.fn(),
    },
  };
});

import { bootstrapTool as mysqlBootstrapTool } from '../mysql/tools/bootstrap-tool';
import { bootstrapTool as pgsqlBootstrapTool } from '../pgsql/tools/bootstrap-tool';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.clearAllMocks();
});

describe.each([
  ['mysql', mysqlBootstrapTool],
  ['pgsql', pgsqlBootstrapTool],
] as const)('bootstrapTool（%s）', (_dialect, bootstrapTool) => {
  it('生产环境执行 seed 直接拒绝，且不创建应用上下文', async () => {
    process.env.NODE_ENV = EnvironmentEnum.PRODUCTION;

    await expect(bootstrapTool('seed')).rejects.toThrow(/仅用于开发\/测试环境/);
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
  });

  it('生产环境执行 reset 同样拒绝', async () => {
    process.env.NODE_ENV = EnvironmentEnum.PRODUCTION;

    await expect(bootstrapTool('reset')).rejects.toThrow(
      /仅用于开发\/测试环境/,
    );
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
  });

  it('非生产环境分发到对应的 ToolsService 方法并关闭上下文', async () => {
    process.env.NODE_ENV = EnvironmentEnum.DEVELOPMENT;
    const seed = vi.fn(async () => {});
    const reset = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
      get: () => ({ seed, reset }),
      close,
    } as never);

    await bootstrapTool('seed');

    expect(seed).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('业务执行抛错时异常向上抛出且上下文仍被关闭', async () => {
    process.env.NODE_ENV = EnvironmentEnum.DEVELOPMENT;
    const inputError = new Error('seed-failed');
    const close = vi.fn(async () => {});
    vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
      get: () => ({
        seed: vi.fn(async () => Promise.reject(inputError)),
        reset: vi.fn(),
      }),
      close,
    } as never);

    await expect(bootstrapTool('seed')).rejects.toBe(inputError);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
