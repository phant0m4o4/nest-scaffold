import type { RedisConnectionConfig } from '@/common/utils/redis/redis-connection';
import type { PinoLogger } from 'nestjs-pino';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeRedisClient, createRedisClient } from '../redis.factory';
import type { RedisClient } from '../redis.types';

/** Redis 容器镜像 */
const REDIS_IMAGE = 'redis:7-alpine';
/** Redis 容器内端口 */
const REDIS_INNER_PORT = 6379;
/** 容器启动 / 测试整体超时（ms） */
const TEST_TIMEOUT_MS = 120_000;

/** 构造仅用于测试的 PinoLogger 桩 */
function buildLoggerStub(): PinoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
}

/**
 * 集成测试：使用 testcontainers 启动真实 Redis，
 * 验证 createRedisClient / closeRedisClient 与 ioredis 的端到端可用性
 * （各模块自建连接的基础设施正是这两个工具函数）。
 */
describe('redis.factory (e2e)', () => {
  let redisContainer: StartedTestContainer;
  let client: RedisClient;

  function buildSingleConfig(db: number): RedisConnectionConfig {
    return {
      mode: 'single',
      single: {
        host: redisContainer.getHost(),
        port: redisContainer.getMappedPort(REDIS_INNER_PORT),
        db,
      },
    };
  }

  beforeAll(async () => {
    redisContainer = await new GenericContainer(REDIS_IMAGE)
      .withExposedPorts(REDIS_INNER_PORT)
      .start();
    client = createRedisClient({
      config: buildSingleConfig(0),
      logger: buildLoggerStub(),
    });
    await client.ping();
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (client) {
      await closeRedisClient({ client, logger: buildLoggerStub() });
    }
    if (redisContainer) {
      await redisContainer.stop();
    }
  }, TEST_TIMEOUT_MS);

  it('应能完成 set/get/delete 基础读写', async () => {
    const inputKey = 'redis-factory-e2e:hello';
    const inputValue = 'world';

    await client.set(inputKey, inputValue);
    const actualValue = await client.get(inputKey);
    const actualDeleted = await client.del(inputKey);

    expect(actualValue).toBe(inputValue);
    expect(actualDeleted).toBe(1);
  });

  it('应能通过 PING 命令验证连接处于活跃状态', async () => {
    const actualReply = await client.ping();

    expect(actualReply).toBe('PONG');
  });

  it('不同 db 的两个连接应互相隔离（模块各自建连的隔离前提）', async () => {
    const isolatedClient = createRedisClient({
      config: buildSingleConfig(1),
      logger: buildLoggerStub(),
    });
    const inputKey = 'redis-factory-e2e:isolation';

    await client.set(inputKey, 'db0');
    const actualOnDb1 = await isolatedClient.get(inputKey);
    await client.del(inputKey);
    await closeRedisClient({
      client: isolatedClient,
      logger: buildLoggerStub(),
    });

    expect(actualOnDb1).toBeNull();
  });

  it('closeRedisClient 后客户端应进入关闭状态', async () => {
    const closableClient = createRedisClient({
      config: buildSingleConfig(0),
      logger: buildLoggerStub(),
    });
    await closableClient.ping();

    await closeRedisClient({
      client: closableClient,
      logger: buildLoggerStub(),
    });
    // ioredis 在 quit 之后 status 可能短暂处于 'close' 再切到 'end'，
    // 此处轮询等待，避免微任务调度造成的不稳定
    for (let i = 0; i < 20 && closableClient.status !== 'end'; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }

    expect(['end', 'close']).toContain(closableClient.status);
  });
});
