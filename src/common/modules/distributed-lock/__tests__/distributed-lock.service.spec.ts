import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeRedisClient,
  createRedisClient,
} from '@/common/utils/redis/redis.factory';
import { DistributedLockService } from '../distributed-lock.service';

vi.mock('@/common/utils/redis/redis.factory', () => ({
  createRedisClient: vi.fn(),
  closeRedisClient: vi.fn(),
}));

vi.mock('redlock', () => ({
  default: class MockRedlock {
    on = vi.fn();
    using = vi.fn();
  },
}));

/** 构造仅含 getOrThrow 的 ConfigService 桩 */
function buildConfigService(): ConfigService {
  return {
    getOrThrow: vi.fn().mockReturnValue({
      keyPrefix: 'distributed-lock',
      connection: {
        mode: 'single',
        single: { host: '127.0.0.1', port: 6379, db: 0 },
      },
    }),
  } as unknown as ConfigService;
}

/** 构造 PinoLogger 桩 */
function buildLogger(): PinoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
}

describe('DistributedLockService（生命周期）', () => {
  let service: DistributedLockService;
  let mockClient: { ping: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { ping: vi.fn().mockResolvedValue('PONG') };
    vi.mocked(createRedisClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof createRedisClient>,
    );
    service = new DistributedLockService(buildConfigService(), buildLogger());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('初始化成功时应基于自己的 connection 配置建连并通过健康检查', async () => {
    await service.onModuleInit();

    expect(createRedisClient).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ mode: 'single' }) as unknown,
      }),
    );
    expect(mockClient.ping).toHaveBeenCalled();
  });

  it('健康检查失败时应关闭刚建好的连接再抛错（防止无限重连定时器泄漏）', async () => {
    mockClient.ping.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.onModuleInit()).rejects.toThrowError('ECONNREFUSED');
    expect(closeRedisClient).toHaveBeenCalledWith(
      expect.objectContaining({ client: mockClient }),
    );
  });

  it('onModuleDestroy 应关闭自己的连接', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(closeRedisClient).toHaveBeenCalledWith(
      expect.objectContaining({ client: mockClient }),
    );
  });

  it('未初始化时 onModuleDestroy 应为空操作', async () => {
    await service.onModuleDestroy();

    expect(closeRedisClient).not.toHaveBeenCalled();
  });
});
