import { BottleneckService } from '@/common/modules/bottleneck/bottleneck.service';
import type { IBottleneckLimiter } from '@/common/modules/bottleneck/interfaces/bottleneck-client.interface';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createService(mode: 'memory' | 'redis' = 'memory') {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const configService = {
    getOrThrow: vi.fn().mockReturnValue({
      mode,
      keyPrefix: 'test',
      connection: null,
    }),
  };
  const service = new BottleneckService(
    configService as unknown as ConfigService,
    logger as unknown as PinoLogger,
  );
  return { service, logger };
}

describe('BottleneckService（任务计数与就绪等待）', () => {
  it('未知限流器应返回零任务和空令牌数', async () => {
    const { service } = createService();
    expect(service.count('missing')).toBe(0);
    expect(await service.currentReservoir('missing')).toBeNull();
  });

  it('真实限流器执行中的任务应被计入，任务完成后应归零', async () => {
    const { service } = createService();
    const started = createDeferred();
    const finish = createDeferred();
    const job = service.schedule('running', async () => {
      started.resolve();
      await finish.promise;
    });
    try {
      await started.promise;
      expect(service.count('running')).toBe(1);
    } finally {
      finish.resolve();
      await job;
      expect(service.count('running')).toBe(0);
      await service.onModuleDestroy();
    }
    expect(service.count('running')).toBe(0);
  });

  it('计数应包括排队、等待开始和执行中的任务，但不含已完成任务', async () => {
    const { service } = createService();
    const limiter = service.createLimiter('counts');
    vi.spyOn(limiter, 'counts').mockReturnValue({
      RECEIVED: 1,
      QUEUED: 2,
      RUNNING: 3,
      EXECUTING: 4,
      DONE: 5,
    });
    try {
      expect(service.count('counts')).toBe(9);
    } finally {
      await service.onModuleDestroy();
    }
  });

  it.each(['wrap', 'schedule'] as const)(
    '%s 应调用并等待限流器 ready()，就绪前不提交任务',
    async (method) => {
      const { service } = createService('redis');
      const ready = createDeferred();
      const limiter = {
        ready: vi.fn(function (this: unknown) {
          expect(this).toBe(limiter);
          return ready.promise;
        }),
        wrap: vi.fn((fn: () => Promise<string>) => fn),
        schedule: vi.fn(async (fn: () => Promise<string>) => await fn()),
      };
      vi.spyOn(service, 'createLimiter').mockReturnValue(
        limiter as unknown as IBottleneckLimiter,
      );
      const execute = vi.fn(async () => await Promise.resolve('ok'));
      const result = service[method]('ready', execute);
      try {
        await Promise.resolve();
        expect(limiter.ready).toHaveBeenCalledOnce();
        expect(limiter[method]).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
      } finally {
        ready.resolve();
        await result;
      }
      expect(await result).toBe('ok');
      expect(execute).toHaveBeenCalledOnce();
    },
  );

  it.each(['wrap', 'schedule'] as const)(
    '%s 的 ready() 失败时应保留原始错误、记录日志且不执行任务',
    async (method) => {
      const { service, logger } = createService('redis');
      const error = new Error('限流器初始化失败');
      const limiter = {
        ready: vi.fn(async () => await Promise.reject(error)),
        wrap: vi.fn((fn: () => Promise<string>) => fn),
        schedule: vi.fn(async (fn: () => Promise<string>) => await fn()),
      };
      vi.spyOn(service, 'createLimiter').mockReturnValue(
        limiter as unknown as IBottleneckLimiter,
      );
      const execute = vi.fn(async () => await Promise.resolve('ok'));

      await expect(service[method]('failed', execute)).rejects.toBe(error);

      expect(execute).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        { error, event: 'limiter_ready_failed', key: 'failed' },
        '限流器初始化失败: failed',
      );
    },
  );
});
