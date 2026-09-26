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
    mget: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
  };
  let mockPipeline: {
    set: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPipeline = {
      set: vi.fn().mockReturnThis(),
      setex: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 'OK']]),
    };
    mockClient = {
      ping: vi.fn().mockResolvedValue('PONG'),
      flushdb: vi.fn().mockResolvedValue('OK'),
      pipeline: vi.fn().mockReturnValue(mockPipeline),
      rename: vi.fn().mockResolvedValue('OK'),
      mget: vi.fn().mockResolvedValue([]),
      eval: vi.fn().mockResolvedValue(1),
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

  it('哨兵模式 flush 也应仅清空缓存专用 DB', async () => {
    const service = new CacheService(
      buildConfigService({
        mode: 'sentinel',
        sentinel: {
          sentinels: [{ host: '127.0.0.1', port: 26379 }],
          masterName: 'mymaster',
          db: 1,
        },
      }),
      buildLogger(),
    );
    await service.onModuleInit();

    await expect(service.flush()).resolves.toBeUndefined();
    expect(mockClient.flushdb).toHaveBeenCalledOnce();
  });

  it('批量读取应使用 MGET 并区分命中与未命中', async () => {
    mockClient.mget.mockResolvedValueOnce([JSON.stringify({ id: 1 }), null]);
    const service = await buildService();

    const actual = await service.getBatch<{ id: number }>(['a', 'b']);

    expect(mockClient.mget).toHaveBeenCalledWith('cache:a', 'cache:b');
    expect(mockClient.pipeline).not.toHaveBeenCalled();
    expect(actual).toEqual([
      { key: 'a', value: { id: 1 }, success: true },
      { key: 'b', value: null, success: true },
    ]);
  });

  async function buildService(): Promise<CacheService> {
    const service = new CacheService(buildConfigService(), buildLogger());
    await service.onModuleInit();
    return service;
  }

  it('批量读取应保留顺序，并隔离无效 JSON', async () => {
    const service = await buildService();
    mockClient.mget.mockResolvedValueOnce(['false', null, 'invalid-json']);

    expect(await service.getBatch(['valid', 'wrong-type', 'invalid'])).toEqual([
      { key: 'valid', value: false, success: true },
      { key: 'wrong-type', value: null, success: true },
      { key: 'invalid', value: null, success: false },
    ]);
  });

  it('批量写入应通过 pipeline 设置 TTL 并统计成功项', async () => {
    const service = await buildService();
    mockPipeline.exec.mockResolvedValueOnce([
      [null, 'OK'],
      [new Error('READONLY'), null],
    ]);

    expect(
      await service.setBatch([
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
      ]),
    ).toBe(1);
    expect(mockPipeline.setex).toHaveBeenNthCalledWith(1, 'cache:a', 60, '1');
    expect(mockPipeline.setex).toHaveBeenNthCalledWith(2, 'cache:b', 60, '2');
    expect(mockPipeline.exec).toHaveBeenCalledOnce();
  });

  it('批量写入永久缓存应使用 SET', async () => {
    const service = await buildService();

    expect(await service.setBatch([{ key: 'a', value: 0 }], -1)).toBe(1);
    expect(mockPipeline.set).toHaveBeenCalledWith('cache:a', '0');
    expect(mockPipeline.setex).not.toHaveBeenCalled();
  });

  it.each([
    { key: 'invalid\nkey', value: 2 },
    { key: 'invalid-value', value: undefined },
  ])('批量写入遇到无效后续项应在任何写入前拒绝', async (invalidItem) => {
    const service = await buildService();

    await expect(
      service.setBatch([{ key: 'valid', value: 1 }, invalidItem]),
    ).rejects.toThrow();
    expect(mockClient.pipeline).not.toHaveBeenCalled();
    expect(mockPipeline.exec).not.toHaveBeenCalled();
  });

  it('批量删除和存在性检查应使用多键命令并返回计数', async () => {
    const service = await buildService();
    mockClient.del.mockResolvedValueOnce(1);
    mockClient.exists.mockResolvedValueOnce(2);

    expect(await service.deleteBatch(['a', 'b'])).toBe(1);
    expect(await service.existsBatch(['c', 'd'])).toBe(2);
    expect(mockClient.del).toHaveBeenCalledWith('cache:a', 'cache:b');
    expect(mockClient.exists).toHaveBeenCalledWith('cache:c', 'cache:d');
    expect(mockClient.pipeline).not.toHaveBeenCalled();
  });

  it.each(['getBatch', 'setBatch', 'deleteBatch', 'existsBatch'] as const)(
    '%s 命令出错时应拒绝，不能静默当作成功',
    async (method) => {
      const service = await buildService();
      mockClient.mget.mockRejectedValue(new Error('ECONNRESET'));
      mockPipeline.exec.mockRejectedValue(new Error('ECONNRESET'));
      mockClient.del.mockRejectedValue(new Error('ECONNRESET'));
      mockClient.exists.mockRejectedValue(new Error('ECONNRESET'));

      const result =
        method === 'setBatch'
          ? service.setBatch([{ key: 'a', value: 1 }])
          : service[method](['a']);
      await expect(result).rejects.toThrow('ECONNRESET');
    },
  );

  it('空批次不应发送任何命令', async () => {
    const service = await buildService();

    expect(await service.getBatch([])).toEqual([]);
    expect(await service.setBatch([])).toBe(0);
    expect(await service.deleteBatch([])).toBe(0);
    expect(await service.existsBatch([])).toBe(0);
    expect(mockClient.mget).not.toHaveBeenCalled();
    expect(mockClient.del).not.toHaveBeenCalled();
    expect(mockClient.exists).not.toHaveBeenCalled();
    expect(mockClient.pipeline).not.toHaveBeenCalled();
  });

  it('重命名和多键脚本可使用普通业务键', async () => {
    const service = await buildService();

    await expect(service.rename('user:1', 'user:2')).resolves.toBe(true);
    await expect(
      service.executeScript('return 1', ['user:1', 'user:2']),
    ).resolves.toBe(1);
    expect(mockClient.rename).toHaveBeenCalledWith(
      'cache:user:1',
      'cache:user:2',
    );
    expect(mockClient.eval).toHaveBeenCalledWith(
      'return 1',
      2,
      'cache:user:1',
      'cache:user:2',
    );
  });
});
