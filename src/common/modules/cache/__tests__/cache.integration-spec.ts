import { CacheService } from '@/common/modules/cache/cache.service';
import type { CacheConfigType } from '@/configs/cache.config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const REDIS_PORT = 6379;
const KEY_PREFIX = `cache-test:${randomUUID()}`;

/**
 * 使用独立 Redis 容器验证缓存的批量读写、序列化与生命周期。
 * 不替换 Redis 客户端工厂或命令，也不读取本地环境配置。
 */
describe('缓存服务与真实 Redis', () => {
  let container: StartedTestContainer | undefined;
  let cacheService: CacheService;
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;

  function keysFor(scenario: string): string[] {
    return [0, 1, 2].map((index) => `${scenario}:${index}`);
  }

  beforeAll(async () => {
    container = await new GenericContainer('redis:8-alpine')
      .withExposedPorts(REDIS_PORT)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .withStartupTimeout(120_000)
      .start();
    const cacheConfig: CacheConfigType = {
      ttlSeconds: 120,
      keyPrefix: KEY_PREFIX,
      connection: {
        mode: 'single',
        single: {
          host: container.getHost(),
          port: container.getMappedPort(REDIS_PORT),
          db: 0,
        },
      },
    };
    cacheService = new CacheService(
      new ConfigService({ cache: cacheConfig }),
      logger,
    );
    await cacheService.onModuleInit();
  }, 120_000);

  afterAll(async () => {
    try {
      if (cacheService) await cacheService.onModuleDestroy();
    } finally {
      await container?.stop();
    }
  }, 120_000);

  it('批量读取应保持输入顺序和重复项', async () => {
    const keys = keysFor('read');
    await Promise.all(keys.map((key, index) => cacheService.set(key, index)));
    const inputKeys = [keys[2], keys[0], keys[1], keys[2]];

    await expect(cacheService.getBatch(inputKeys)).resolves.toEqual([
      { key: keys[2], value: 2, success: true },
      { key: keys[0], value: 0, success: true },
      { key: keys[1], value: 1, success: true },
      { key: keys[2], value: 2, success: true },
    ]);
  });

  it('应区分损坏 JSON，非字符串键按 MGET 语义视为未命中', async () => {
    const [validKey, missingKey, brokenKey] = keysFor('read-errors');
    const wrongTypeKey = `${validKey}:list`;
    await cacheService.set(validKey, false);
    await cacheService.setRaw(brokenKey, '{broken-json');
    await cacheService.executeScript(
      "return redis.call('LPUSH', KEYS[1], ARGV[1])",
      [wrongTypeKey],
      ['list-item'],
    );

    await expect(
      cacheService.getBatch([missingKey, validKey, brokenKey, wrongTypeKey]),
    ).resolves.toEqual([
      { key: missingKey, value: null, success: true },
      { key: validKey, value: false, success: true },
      { key: brokenKey, value: null, success: false },
      { key: wrongTypeKey, value: null, success: true },
    ]);
  });

  it.each([120, -1])('批量写入应保留 TTL=%i 秒', async (ttl) => {
    const keys = keysFor(`write-${ttl}`);
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

  it('重复键应只计一次实际删除', async () => {
    const keys = keysFor('delete');
    await Promise.all(keys.map((key) => cacheService.set(key, true)));

    await expect(cacheService.deleteBatch([...keys, keys[0]])).resolves.toBe(3);
    await expect(cacheService.deleteBatch(keys)).resolves.toBe(0);
    await expect(
      Promise.all(keys.map((key) => cacheService.get(key))),
    ).resolves.toEqual([null, null, null]);
  });

  it('存在性检查应保留 EXISTS 对重复键的计数语义', async () => {
    const keys = keysFor('exists');
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
      const [validKey, secondKey] = keysFor(`invalid-${scenario}`);
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
    const keys = keysFor('invalid-ttl');

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

  it.each([-2, -Infinity, NaN, Infinity, 1.5])(
    '非法 TTL %s 不应产生永久缓存或改写已有数据',
    async (ttl) => {
      const [singleKey, rawKey, batchKey] = keysFor(`invalid-ttl-${ttl}`);
      await cacheService.set(singleKey, 'original', 120);

      await expect(cacheService.set(singleKey, 'changed', ttl)).rejects.toThrow(
        'TTL',
      );
      await expect(cacheService.setRaw(rawKey, 'value', ttl)).rejects.toThrow(
        'TTL',
      );
      await expect(
        cacheService.setBatch([{ key: batchKey, value: true }], ttl),
      ).rejects.toThrow('TTL');
      await expect(cacheService.expire(singleKey, ttl)).rejects.toThrow('TTL');
      await expect(cacheService.get(singleKey)).resolves.toBe('original');
      await expect(cacheService.getTTL(singleKey)).resolves.toBeGreaterThan(0);
      await expect(cacheService.get(rawKey)).resolves.toBeNull();
      await expect(cacheService.get(batchKey)).resolves.toBeNull();
    },
  );

  it('单次写入应保留永久缓存与显式设置过期时间的语义', async () => {
    const [jsonKey, rawKey] = keysFor('single-ttl');
    await cacheService.set(jsonKey, { value: true }, -1);
    await cacheService.setRaw(rawKey, 'raw', -1);
    await expect(cacheService.getTTL(jsonKey)).resolves.toBe(-1);
    await expect(cacheService.getTTL(rawKey)).resolves.toBe(-1);
    await expect(cacheService.expire(rawKey, 120)).resolves.toBe(true);
    await expect(cacheService.getTTL(rawKey)).resolves.toBeGreaterThan(0);
    await expect(cacheService.getRaw(rawKey)).resolves.toBe('raw');
  });
});
