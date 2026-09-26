import { CacheService } from '@/common/modules/cache/cache.service';
import { createRedisClient } from '@/common/utils/redis/redis.factory';
import type { CacheConfigType } from '@/configs/cache.config';
import { ConfigService } from '@nestjs/config';
import { Cluster } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import {
  GenericContainer,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/utils/redis/redis.factory', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/common/utils/redis/redis.factory')>();
  return { ...actual, createRedisClient: vi.fn() };
});

const REDIS_PORT = 6379;
const KEY_PREFIX = `cache-cluster-test:${randomUUID()}`;

/**
 * 真实三主节点集成测试：只替换客户端创建边界，为 Docker 端口映射提供 natMap。
 * Redis 命令、路由、序列化和缓存生命周期均执行真实实现，不替换任何 Redis 命令。
 */
describe('缓存服务与真实 Redis Cluster', () => {
  let network: StartedNetwork | undefined;
  const containers: StartedTestContainer[] = [];
  let cluster: Cluster | undefined;
  let cacheService: CacheService;
  let masterTags: string[];
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;

  function keysAcrossMasters(scenario: string): string[] {
    return masterTags.map((tag) => `${scenario}:{${tag}}`);
  }

  function fullKey(key: string): string {
    return `${KEY_PREFIX}:${key}`;
  }

  beforeAll(async () => {
    network = await new Network().start();
    const starts = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        new GenericContainer('redis:8-alpine')
          .withNetwork(network!)
          .withExposedPorts(REDIS_PORT)
          .withCommand([
            'redis-server',
            '--cluster-enabled',
            'yes',
            '--cluster-config-file',
            'nodes.conf',
            '--cluster-node-timeout',
            '5000',
            '--appendonly',
            'no',
            '--save',
            '',
            '--protected-mode',
            'no',
          ])
          .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
          .withStartupTimeout(120_000)
          .start(),
      ),
    );
    for (const result of starts) {
      if (result.status === 'fulfilled') containers.push(result.value);
    }
    const failedStart = starts.find((result) => result.status === 'rejected');
    if (failedStart?.status === 'rejected') throw failedStart.reason;

    const addresses = containers.map(
      (container) =>
        `${container.getIpAddress(network!.getName())}:${REDIS_PORT}`,
    );
    const creation = await containers[0].exec([
      'redis-cli',
      '--cluster',
      'create',
      ...addresses,
      '--cluster-replicas',
      '0',
      '--cluster-yes',
    ]);
    expect(creation.exitCode, creation.output).toBe(0);
    // redis-cli 完成槽位分配时，各节点的集群状态仍可能尚未收敛。
    await vi.waitFor(
      async () => {
        const infos = await Promise.all(
          containers.map((container) =>
            container.exec(['redis-cli', 'CLUSTER', 'INFO']),
          ),
        );
        expect(
          infos.map(
            (info) =>
              info.exitCode === 0 && /^cluster_state:ok\r?$/m.test(info.stdout),
          ),
        ).toEqual([true, true, true]);
      },
      { timeout: 30_000, interval: 250 },
    );
    const startupNodes = containers.map((container) => ({
      host: container.getHost(),
      port: container.getMappedPort(REDIS_PORT),
    }));
    cluster = new Cluster(startupNodes, {
      natMap: Object.fromEntries(
        addresses.map((address, index) => [address, startupNodes[index]]),
      ),
      clusterRetryStrategy: (attempt) => (attempt <= 30 ? 500 : null),
      redisOptions: { maxRetriesPerRequest: 2, commandTimeout: 10_000 },
    });
    cluster.on('error', (error) => logger.error(error));
    vi.mocked(createRedisClient).mockReturnValue(cluster);
    const cacheConfig: CacheConfigType = {
      ttlSeconds: 120,
      keyPrefix: KEY_PREFIX,
      connection: { mode: 'cluster', cluster: { nodes: startupNodes } },
    };
    cacheService = new CacheService(
      new ConfigService({ cache: cacheConfig }),
      logger,
    );
    await cacheService.onModuleInit();

    const ranges = await cluster.cluster('SLOTS');
    expect(new Set(ranges.map((range) => range[2][2])).size).toBe(3);
    const tagsByMaster = new Map<string, string>();
    for (let index = 0; index < 100 && tagsByMaster.size < 3; index += 1) {
      const tag = `master-${index}`;
      const slot = await cluster.cluster('KEYSLOT', `{${tag}}`);
      const owner = ranges.find(
        ([first, last]) => slot >= first && slot <= last,
      );
      if (owner) tagsByMaster.set(owner[2][2], tag);
    }
    expect(tagsByMaster.size).toBe(3);
    masterTags = [...tagsByMaster.values()];
  }, 180_000);

  afterAll(async () => {
    if (cacheService) await cacheService.onModuleDestroy();
    cluster?.disconnect();
    const stops = await Promise.allSettled(
      containers.map((container) => container.stop()),
    );
    await network?.stop();
    const failedStops = stops.filter((result) => result.status === 'rejected');
    if (failedStops.length > 0) {
      throw new AggregateError(
        failedStops.map((result): unknown => result.reason),
        'Redis Cluster 测试容器清理失败',
      );
    }
  }, 120_000);

  it('应跨三个主节点读取并保持输入顺序和重复项', async () => {
    const keys = keysAcrossMasters('read');
    await Promise.all(keys.map((key, index) => cacheService.set(key, index)));
    const inputKeys = [keys[2], keys[0], keys[1], keys[2]];

    await expect(cacheService.getBatch(inputKeys)).resolves.toEqual([
      { key: keys[2], value: 2, success: true },
      { key: keys[0], value: 0, success: true },
      { key: keys[1], value: 1, success: true },
      { key: keys[2], value: 2, success: true },
    ]);
  });

  it('应逐项区分命中、未命中、损坏 JSON 和 Redis 类型错误', async () => {
    const [validKey, missingKey, brokenKey] = keysAcrossMasters('read-errors');
    const wrongTypeKey = `${validKey}:list`;
    await cacheService.set(validKey, false);
    await cacheService.setRaw(brokenKey, '{broken-json');
    await cluster!.lpush(fullKey(wrongTypeKey), 'list-item');

    await expect(
      cacheService.getBatch([missingKey, validKey, brokenKey, wrongTypeKey]),
    ).resolves.toEqual([
      { key: missingKey, value: null, success: true },
      { key: validKey, value: false, success: true },
      { key: brokenKey, value: null, success: false },
      { key: wrongTypeKey, value: null, success: false },
    ]);
  });

  it.each([120, -1])('应跨三个主节点批量写入并保留 TTL=%i 秒', async (ttl) => {
    const keys = keysAcrossMasters(`write-${ttl}`);
    const items = keys.map((key, index) => ({ key, value: { index } }));

    await expect(cacheService.setBatch(items, ttl)).resolves.toBe(3);
    for (const [index, key] of keys.entries()) {
      await expect(cacheService.get(key)).resolves.toEqual({ index });
      const actualTtl = await cacheService.getTTL(key);
      if (ttl === -1) expect(actualTtl).toBe(-1);
      else {
        expect(actualTtl).toBeGreaterThan(0);
        expect(actualTtl).toBeLessThanOrEqual(ttl);
      }
    }
  });

  it('应跨三个主节点删除且重复键只计一次实际删除', async () => {
    const keys = keysAcrossMasters('delete');
    await Promise.all(keys.map((key) => cacheService.set(key, true)));

    await expect(cacheService.deleteBatch([...keys, keys[0]])).resolves.toBe(3);
    await expect(cacheService.deleteBatch(keys)).resolves.toBe(0);
    await expect(
      Promise.all(keys.map((key) => cacheService.get(key))),
    ).resolves.toEqual([null, null, null]);
  });

  it('应跨三个主节点按输入项计数并保留 EXISTS 对重复键的语义', async () => {
    const keys = keysAcrossMasters('exists');
    await Promise.all(keys.map((key) => cacheService.set(key, true)));

    await expect(
      cacheService.existsBatch([...keys, keys[0], `${keys[1]}:missing`]),
    ).resolves.toBe(4);
  });

  it('空输入应返回空结果且不产生 Redis 错误', async () => {
    await expect(cacheService.getBatch([])).resolves.toEqual([]);
    await expect(cacheService.setBatch([])).resolves.toBe(0);
    await expect(cacheService.deleteBatch([])).resolves.toBe(0);
    await expect(cacheService.existsBatch([])).resolves.toBe(0);
  });

  it.each(['empty-key', 'undefined-value', 'circular-value'])(
    '后续项无效时不应提前写入前面的合法项：%s',
    async (scenario) => {
      const [validKey, secondKey] = keysAcrossMasters(`invalid-${scenario}`);
      const circularValue: { self?: unknown } = {};
      circularValue.self = circularValue;
      const invalidItem =
        scenario === 'empty-key'
          ? { key: '', value: 'invalid' }
          : {
              key: secondKey,
              value: scenario === 'undefined-value' ? undefined : circularValue,
            };

      await expect(
        cacheService.setBatch<unknown>([
          { key: validKey, value: 'must-not-be-written' },
          invalidItem,
        ]),
      ).rejects.toThrow();
      await expect(cacheService.get(validKey)).resolves.toBeNull();
      await expect(cacheService.get(secondKey)).resolves.toBeNull();
    },
  );

  it('TTL 为 0 时应拒绝整批写入', async () => {
    const keys = keysAcrossMasters('invalid-ttl');

    await expect(
      cacheService.setBatch(
        keys.map((key) => ({ key, value: true })),
        0,
      ),
    ).rejects.toThrow('缓存 TTL 时间不能为 0');
    await expect(
      Promise.all(keys.map((key) => cacheService.get(key))),
    ).resolves.toEqual([null, null, null]);
  });
});
