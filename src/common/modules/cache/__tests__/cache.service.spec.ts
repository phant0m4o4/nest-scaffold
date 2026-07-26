import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeRedisClient,
  createRedisClient,
} from '@/common/utils/redis/redis.factory';
import { CacheService } from '../cache.service';

vi.mock('@/common/utils/redis/redis.factory', () => ({
  createRedisClient: vi.fn(),
  closeRedisClient: vi.fn(),
}));

/** 构造仅含 getOrThrow 的 ConfigService 桩 */
function buildConfigService(
  connection: Record<string, unknown> = {
    mode: 'single',
    single: { host: '127.0.0.1', port: 6379, db: 1 },
  },
): ConfigService {
  return {
    getOrThrow: vi.fn().mockReturnValue({
      ttlSeconds: 60,
      keyPrefix: 'cache',
      connection,
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

describe('CacheService（生命周期与隔离语义）', () => {
  let mockClient: {
    ping: ReturnType<typeof vi.fn>;
    flushdb: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      ping: vi.fn().mockResolvedValue('PONG'),
      flushdb: vi.fn().mockResolvedValue('OK'),
    };
    vi.mocked(createRedisClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof createRedisClient>,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('初始化成功时应基于自己的 connection 配置建连并通过健康检查', async () => {
    const service = new CacheService(buildConfigService(), buildLogger());

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
    const service = new CacheService(buildConfigService(), buildLogger());

    await expect(service.onModuleInit()).rejects.toThrowError('ECONNREFUSED');
    expect(closeRedisClient).toHaveBeenCalledWith(
      expect.objectContaining({ client: mockClient }),
    );
  });

  it('onModuleDestroy 应关闭自己的连接', async () => {
    const service = new CacheService(buildConfigService(), buildLogger());
    await service.onModuleInit();

    await service.onModuleDestroy();

    expect(closeRedisClient).toHaveBeenCalledWith(
      expect.objectContaining({ client: mockClient }),
    );
  });

  it('flush 应执行 FLUSHDB（仅缓存专用 DB）', async () => {
    const service = new CacheService(buildConfigService(), buildLogger());
    await service.onModuleInit();

    await service.flush();

    expect(mockClient.flushdb).toHaveBeenCalled();
  });

  it('cluster 模式下 flush 应直接拒绝（无 DB 隔离且 FLUSHDB 仅达单节点）', async () => {
    const service = new CacheService(
      buildConfigService({
        mode: 'cluster',
        cluster: { nodes: [{ host: '10.0.0.1', port: 7000 }] },
      }),
      buildLogger(),
    );
    await service.onModuleInit();

    await expect(service.flush()).rejects.toThrowError('cluster');
    expect(mockClient.flushdb).not.toHaveBeenCalled();
  });
});
