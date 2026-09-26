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
    pipeline: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
  };
  let mockPipeline: {
    get: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPipeline = {
      get: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exists: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    };
    mockClient = {
      ping: vi.fn().mockResolvedValue('PONG'),
      flushdb: vi.fn().mockResolvedValue('OK'),
      pipeline: vi.fn().mockReturnValue(mockPipeline),
      rename: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      exists: vi.fn().mockResolvedValue(1),
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

  it('cluster 模式批量读取应逐键路由，不使用跨节点手动 pipeline', async () => {
    mockClient.get
      .mockResolvedValueOnce(JSON.stringify({ id: 1 }))
      .mockResolvedValueOnce(null);
    const service = new CacheService(
      buildConfigService({
        mode: 'cluster',
        cluster: { nodes: [{ host: '10.0.0.1', port: 7000 }] },
      }),
      buildLogger(),
    );
    await service.onModuleInit();

    const actual = await service.getBatch<{ id: number }>(['a', 'b']);

    expect(mockClient.get).toHaveBeenNthCalledWith(1, 'cache:a');
    expect(mockClient.get).toHaveBeenNthCalledWith(2, 'cache:b');
    expect(mockClient.pipeline).not.toHaveBeenCalled();
    expect(actual).toEqual([
      { key: 'a', value: { id: 1 }, success: true },
      { key: 'b', value: null, success: true },
    ]);
  });

  async function buildClusterService(): Promise<CacheService> {
    const service = new CacheService(
      buildConfigService({
        mode: 'cluster',
        cluster: { nodes: [{ host: '10.0.0.1', port: 7000 }] },
      }),
      buildLogger(),
    );
    await service.onModuleInit();
    return service;
  }

  it('cluster 批量读取应保留顺序，并隔离命令失败和无效 JSON', async () => {
    const service = await buildClusterService();
    mockClient.get
      .mockResolvedValueOnce('false')
      .mockRejectedValueOnce(new Error('WRONGTYPE'))
      .mockResolvedValueOnce('invalid-json');

    expect(await service.getBatch(['valid', 'wrong-type', 'invalid'])).toEqual([
      { key: 'valid', value: false, success: true },
      { key: 'wrong-type', value: null, success: false },
      { key: 'invalid', value: null, success: false },
    ]);
  });

  it('cluster 批量写入应逐键设置 TTL 并统计成功项', async () => {
    const service = await buildClusterService();
    mockClient.setex
      .mockResolvedValueOnce('OK')
      .mockRejectedValueOnce(new Error('READONLY'));

    expect(
      await service.setBatch([
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
      ]),
    ).toBe(1);
    expect(mockClient.setex).toHaveBeenNthCalledWith(1, 'cache:a', 60, '1');
    expect(mockClient.setex).toHaveBeenNthCalledWith(2, 'cache:b', 60, '2');
    expect(mockClient.pipeline).not.toHaveBeenCalled();
  });

  it('cluster 批量写入永久缓存应使用 SET', async () => {
    const service = await buildClusterService();

    expect(await service.setBatch([{ key: 'a', value: 0 }], -1)).toBe(1);
    expect(mockClient.set).toHaveBeenCalledWith('cache:a', '0');
    expect(mockClient.setex).not.toHaveBeenCalled();
  });

  it.each([
    { key: 'invalid\nkey', value: 2 },
    { key: 'invalid-value', value: undefined },
  ])(
    'cluster 批量写入遇到无效后续项应在任何写入前拒绝',
    async (invalidItem) => {
      const service = await buildClusterService();

      await expect(
        service.setBatch([{ key: 'valid', value: 1 }, invalidItem]),
      ).rejects.toThrow();
      expect(mockClient.set).not.toHaveBeenCalled();
      expect(mockClient.setex).not.toHaveBeenCalled();
      expect(mockPipeline.exec).not.toHaveBeenCalled();
    },
  );

  it('cluster 批量删除和存在性检查应逐键路由并累计计数', async () => {
    const service = await buildClusterService();
    mockClient.del.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    expect(await service.deleteBatch(['a', 'b'])).toBe(1);
    expect(await service.existsBatch(['c', 'd'])).toBe(2);
    expect(mockClient.del).toHaveBeenNthCalledWith(1, 'cache:a');
    expect(mockClient.del).toHaveBeenNthCalledWith(2, 'cache:b');
    expect(mockClient.exists).toHaveBeenNthCalledWith(1, 'cache:c');
    expect(mockClient.exists).toHaveBeenNthCalledWith(2, 'cache:d');
    expect(mockClient.pipeline).not.toHaveBeenCalled();
  });

  it.each(['deleteBatch', 'existsBatch'] as const)(
    'cluster %s 命令出错时应拒绝，不能静默当作零',
    async (method) => {
      const service = await buildClusterService();
      mockClient.del.mockRejectedValue(new Error('ECONNRESET'));
      mockClient.exists.mockRejectedValue(new Error('ECONNRESET'));

      await expect(service[method](['a'])).rejects.toThrow('ECONNRESET');
    },
  );

  it('cluster 空批次不应发送任何命令', async () => {
    const service = await buildClusterService();

    expect(await service.getBatch([])).toEqual([]);
    expect(await service.setBatch([])).toBe(0);
    expect(await service.deleteBatch([])).toBe(0);
    expect(await service.existsBatch([])).toBe(0);
    expect(mockClient.get).not.toHaveBeenCalled();
    expect(mockClient.setex).not.toHaveBeenCalled();
    expect(mockClient.del).not.toHaveBeenCalled();
    expect(mockClient.exists).not.toHaveBeenCalled();
    expect(mockClient.pipeline).not.toHaveBeenCalled();
  });

  it('cluster 模式 rename 应拒绝不同 hash tag', async () => {
    const service = new CacheService(
      buildConfigService({
        mode: 'cluster',
        cluster: { nodes: [{ host: '10.0.0.1', port: 7000 }] },
      }),
      buildLogger(),
    );
    await service.onModuleInit();

    await expect(service.rename('{user-1}:a', '{user-2}:b')).rejects.toThrow(
      /hash-tag/,
    );
    expect(mockClient.rename).not.toHaveBeenCalled();
  });
});
