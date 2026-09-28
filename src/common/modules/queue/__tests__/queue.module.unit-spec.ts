import { getQueueToken } from '@nestjs/bullmq';
import type { DynamicModule, FactoryProvider } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { QueueModule } from '../queue.module';

function concurrencyProviders(module: DynamicModule): FactoryProvider[] {
  return (module.providers ?? []).filter(
    (provider): provider is FactoryProvider =>
      typeof provider === 'object' &&
      'useFactory' in provider &&
      typeof provider.provide === 'symbol' &&
      provider.provide.description?.startsWith('QueueGlobalConcurrency:') ===
        true,
  );
}

describe.each(['sync', 'async'] as const)('队列并发配置：%s', (mode) => {
  function register(globalConcurrency?: number, name?: string): DynamicModule {
    const options = { name, globalConcurrency };
    return mode === 'sync'
      ? QueueModule.registerQueue(options)
      : QueueModule.registerQueueAsync({ ...options, useFactory: () => ({}) });
  }

  it.each([-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    '应拒绝非法并发值 %s',
    (value) => {
      expect(() => register(value, 'email')).toThrow(/globalConcurrency/);
    },
  );

  it('未指定并发时不修改已有 Redis 限制', () => {
    expect(concurrencyProviders(register(undefined, 'email'))).toEqual([]);
  });

  it.each([undefined, 'email'])('正整数应应用到队列 %s', async (name) => {
    const [provider] = concurrencyProviders(register(2, name));
    const queue = { setGlobalConcurrency: vi.fn().mockResolvedValue(1) };

    expect(provider).toBeDefined();
    expect(provider.inject).toEqual([getQueueToken(name)]);
    await provider.useFactory(queue);
    expect(queue.setGlobalConcurrency).toHaveBeenCalledExactlyOnceWith(2);
  });

  it.each([undefined, 'email'])(
    '0 应清除队列 %s 已有的并发限制',
    async (name) => {
      const [provider] = concurrencyProviders(register(0, name));
      const queue = { removeGlobalConcurrency: vi.fn().mockResolvedValue(1) };

      expect(provider).toBeDefined();
      expect(provider.inject).toEqual([getQueueToken(name)]);
      await provider.useFactory(queue);
      expect(queue.removeGlobalConcurrency).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it.each([0, 1])(
    '并发初始化 %s 的 Redis 错误应向启动调用方传播',
    async (value) => {
      const [provider] = concurrencyProviders(register(value, 'email'));
      const error = new Error('Redis 写入失败');
      const queue = {
        setGlobalConcurrency: vi.fn().mockRejectedValue(error),
        removeGlobalConcurrency: vi.fn().mockRejectedValue(error),
      };

      expect(provider).toBeDefined();
      await expect(provider.useFactory(queue)).rejects.toBe(error);
    },
  );
});
