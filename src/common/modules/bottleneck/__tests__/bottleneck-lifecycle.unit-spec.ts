import { BottleneckService } from '@/common/modules/bottleneck/bottleneck.service';
import { createRedisClient } from '@/common/utils/redis/redis.factory';
import type { RedisClient } from '@/common/utils/redis/redis.types';
import type { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/utils/redis/redis.factory', () => ({
  createRedisClient: vi.fn(),
  closeRedisClient: vi.fn(async ({ client }: { client: RedisClient }) => {
    await Promise.resolve(client.disconnect());
  }),
}));

/** 只替换网络边界，连接、限流器及其事件/Promise 均使用真实 Bottleneck。 */
class MockRedisClient extends EventEmitter {
  public status: 'ready' | 'connecting' | 'end' = 'connecting';
  public readonly subscriber: MockRedisClient | null;
  public readonly disconnect = vi.fn(() => {
    this.status = 'end';
  });
  public readonly duplicate = vi.fn(() => {
    if (!this.subscriber) throw new Error('订阅客户端不能再次复制');
    return this.subscriber;
  });
  public readonly unsubscribe = vi.fn(
    async () => await new Promise<void>(() => undefined),
  );

  constructor(isSubscriber = false) {
    super();
    this.subscriber = isSubscriber ? null : new MockRedisClient(true);
  }

  public subscribe(_channel: string, callback: () => void): void {
    callback();
  }

  public defineCommand(name: string): void {
    const replies: Record<string, unknown[]> = {
      submit: [0, null, 0],
      register: [1, 0, null],
      free: [0],
    };
    Object.assign(this, {
      [name]: (...args: unknown[]) => {
        const callback = args.at(-1) as (
          error: Error | null,
          result: unknown[],
        ) => void;
        callback(null, replies[name] ?? []);
      },
    });
  }

  public becomeReady(): void {
    this.status = 'ready';
    this.emit('ready');
    if (this.subscriber) this.subscriber.becomeReady();
  }
}

const services: BottleneckService[] = [];

function createService() {
  const client = new MockRedisClient();
  vi.mocked(createRedisClient).mockReturnValue(
    client as unknown as RedisClient,
  );
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const service = new BottleneckService(
    {
      getOrThrow: () => ({
        mode: 'redis',
        keyPrefix: 'test-lifecycle',
        connection: {
          mode: 'single',
          single: { host: 'unused.invalid', port: 6379, db: 3 },
        },
      }),
    } as unknown as ConfigService,
    logger as unknown as PinoLogger,
  );
  services.push(service);
  return { service, client, logger };
}

afterEach(async () => {
  for (const service of services.splice(0)) await service.onModuleDestroy();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Bottleneck Redis 生命周期', () => {
  it('应等待两个客户端就绪，成功后清理等待定时器并保留运行时错误日志', async () => {
    vi.useFakeTimers();
    const { service, client, logger } = createService();
    let settled = false;
    const initialized = service.onModuleInit().then(() => {
      settled = true;
    });
    client.status = 'ready';
    client.emit('ready');
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    client.subscriber?.becomeReady();
    await initialized;
    expect(vi.getTimerCount()).toBe(0);
    const error = new Error('运行中连接断开');
    client.emit('error', error);
    expect(logger.error).toHaveBeenCalledWith(
      { error, event: 'bottleneck_connection_error' },
      expect.any(String),
    );
  });

  it.each(['command', 'subscriber'] as const)(
    '%s 首次连接错误应立即拒绝、保留原始错误并关闭两条连接',
    async (source) => {
      vi.useFakeTimers();
      const { service, client } = createService();
      const error = new Error('WRONGPASS 测试错误凭据');
      let actualError: unknown;
      const initialized = service.onModuleInit().catch((reason: unknown) => {
        actualError = reason;
      });

      (source === 'command' ? client : client.subscriber)?.emit('error', error);
      await vi.advanceTimersByTimeAsync(0);

      expect(actualError).toBe(error);
      await initialized;
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(client.subscriber?.disconnect).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('无任何就绪或错误事件时应在十秒后失败，迟到的 ready 不得恢复初始化', async () => {
    vi.useFakeTimers();
    const { service, client, logger } = createService();
    let actualError: unknown;
    const initialized = service.onModuleInit().catch((reason: unknown) => {
      actualError = reason;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(actualError).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(actualError).toBeInstanceOf(Error);
    expect((actualError as Error).message).toContain('10000');
    await initialized;
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(client.subscriber?.disconnect).toHaveBeenCalledOnce();
    client.becomeReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.info).not.toHaveBeenCalledWith('Bottleneck Redis 连接已创建');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('连接构造失败应关闭尚未移交的自建客户端并保留原始错误', async () => {
    const { service, client } = createService();
    const error = new Error('复制连接失败');
    client.duplicate.mockImplementationOnce(() => {
      throw error;
    });
    await expect(service.onModuleInit()).rejects.toBe(error);
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(client.subscriber?.disconnect).not.toHaveBeenCalled();
  });

  it('真实连接的 ready 自身拒绝时应保留错误并关闭两条连接', async () => {
    const { service, client } = createService();
    const error = new Error('脚本注册失败');
    vi.spyOn(client, 'defineCommand').mockImplementationOnce(() => {
      throw error;
    });
    client.becomeReady();

    await expect(service.onModuleInit()).rejects.toBe(error);

    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(client.subscriber?.disconnect).toHaveBeenCalledOnce();
  });

  it('应先终止共享连接再清理真实限流器，避免发送悬空取消订阅并避免重复关闭', async () => {
    const { service, client } = createService();
    client.becomeReady();
    await service.onModuleInit();
    const limiter = service.createLimiter('shutdown', { maxConcurrent: 1 });
    await limiter.ready();

    await service.onModuleDestroy();
    await service.onModuleDestroy();

    expect(client.subscriber?.unsubscribe).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(client.subscriber?.disconnect).toHaveBeenCalledOnce();
    expect(service.count('shutdown')).toBe(0);
  });
});
