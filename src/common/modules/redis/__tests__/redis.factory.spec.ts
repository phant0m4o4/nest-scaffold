/* eslint-disable @typescript-eslint/unbound-method */
import type { RedisModuleConfig } from '@/configs/redis.config';
import { EventEmitter } from 'events';
import type { PinoLogger } from 'nestjs-pino';

/**
 * 用 EventEmitter 充当 ioredis 的 Redis / Cluster 实例
 *
 * 暴露：
 * - status：模拟客户端连接状态
 * - quit / disconnect：jest mock，便于断言关闭分支
 * - constructorArgs：保留构造时透传的参数，用于断言配置映射
 */
class MockRedisClient extends EventEmitter {
  public status = 'ready';
  public readonly quit = jest.fn(async () => await Promise.resolve('OK'));
  public readonly disconnect = jest.fn();
  public constructor(public readonly constructorArgs: unknown[]) {
    super();
  }
}

const redisInstances: MockRedisClient[] = [];
const clusterInstances: MockRedisClient[] = [];

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation((...args: unknown[]) => {
    const instance = new MockRedisClient(args);
    redisInstances.push(instance);
    return instance;
  }),
  Cluster: jest.fn().mockImplementation((...args: unknown[]) => {
    const instance = new MockRedisClient(args);
    clusterInstances.push(instance);
    return instance;
  }),
}));

import { Cluster, Redis } from 'ioredis';

import { closeRedisClient, createRedisClient } from '../redis.factory';

/**
 * 构造一个仅断言所需方法的 PinoLogger 测试替身
 */
function buildMockLogger(): jest.Mocked<PinoLogger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  } as unknown as jest.Mocked<PinoLogger>;
}

describe('redis.factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisInstances.length = 0;
    clusterInstances.length = 0;
  });

  describe('createRedisClient', () => {
    it('在 single 模式下应使用 Redis 构造函数透传 host/port/password/db', () => {
      const inputConfig: RedisModuleConfig = {
        mode: 'single',
        single: {
          host: '10.0.0.1',
          port: 6380,
          password: 'pwd-single',
          db: 2,
        },
      };
      const mockLogger = buildMockLogger();

      const actualClient = createRedisClient({
        config: inputConfig,
        logger: mockLogger,
      });

      const expectedRedisCtor = Redis as unknown as jest.Mock;
      expect(expectedRedisCtor).toHaveBeenCalledTimes(1);
      expect(expectedRedisCtor).toHaveBeenCalledWith({
        host: '10.0.0.1',
        port: 6380,
        password: 'pwd-single',
        db: 2,
      });
      expect(actualClient).toBe(redisInstances[0]);
    });

    it('在 sentinel 模式下应使用 Redis 构造函数透传 name/sentinels/password/db', () => {
      const inputConfig: RedisModuleConfig = {
        mode: 'sentinel',
        sentinel: {
          masterName: 'mymaster',
          sentinels: [
            { host: 's1', port: 26379 },
            { host: 's2', port: 26380 },
          ],
          password: 'pwd-sentinel',
          db: 1,
        },
      };
      const mockLogger = buildMockLogger();

      const actualClient = createRedisClient({
        config: inputConfig,
        logger: mockLogger,
      });

      const expectedRedisCtor = Redis as unknown as jest.Mock;
      expect(expectedRedisCtor).toHaveBeenCalledWith({
        name: 'mymaster',
        sentinels: [
          { host: 's1', port: 26379 },
          { host: 's2', port: 26380 },
        ],
        password: 'pwd-sentinel',
        db: 1,
      });
      expect(actualClient).toBe(redisInstances[0]);
    });

    it('在 cluster 模式下应使用 Cluster 构造函数透传 nodes 与 redisOptions.password', () => {
      const inputConfig: RedisModuleConfig = {
        mode: 'cluster',
        cluster: {
          nodes: [
            { host: 'c1', port: 7000 },
            { host: 'c2', port: 7001 },
          ],
          password: 'pwd-cluster',
        },
      };
      const mockLogger = buildMockLogger();

      const actualClient = createRedisClient({
        config: inputConfig,
        logger: mockLogger,
      });

      const expectedClusterCtor = Cluster as unknown as jest.Mock;
      expect(expectedClusterCtor).toHaveBeenCalledTimes(1);
      expect(expectedClusterCtor).toHaveBeenCalledWith(
        [
          { host: 'c1', port: 7000 },
          { host: 'c2', port: 7001 },
        ],
        { redisOptions: { password: 'pwd-cluster' } },
      );
      expect(actualClient).toBe(clusterInstances[0]);
    });

    it('在客户端 emit error 事件时应通过 logger.error 输出结构化日志', () => {
      const inputConfig: RedisModuleConfig = {
        mode: 'single',
        single: { host: '127.0.0.1', port: 6379, db: 0 },
      };
      const mockLogger = buildMockLogger();
      const inputError = new Error('boom');

      const actualClient = createRedisClient({
        config: inputConfig,
        logger: mockLogger,
      });
      (actualClient as unknown as EventEmitter).emit('error', inputError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'redis_error',
          error: inputError,
        }),
        expect.any(String),
      );
    });

    it('在客户端 emit ready 事件时应通过 logger.info 输出连接就绪日志', () => {
      const inputConfig: RedisModuleConfig = {
        mode: 'single',
        single: { host: '127.0.0.1', port: 6379, db: 0 },
      };
      const mockLogger = buildMockLogger();

      const actualClient = createRedisClient({
        config: inputConfig,
        logger: mockLogger,
      });
      (actualClient as unknown as EventEmitter).emit('ready');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('就绪'),
      );
    });
  });

  describe('closeRedisClient', () => {
    it('在客户端 status 为 ready 时应调用 quit 并打印优雅关闭日志', async () => {
      const mockClient = new MockRedisClient([]);
      mockClient.status = 'ready';
      const mockLogger = buildMockLogger();

      await closeRedisClient({
        client: mockClient as unknown as Redis,
        logger: mockLogger,
      });

      expect(mockClient.quit).toHaveBeenCalledTimes(1);
      expect(mockClient.disconnect).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('优雅关闭'),
      );
    });

    it('在客户端 status 为 end 时应直接 disconnect', async () => {
      const mockClient = new MockRedisClient([]);
      mockClient.status = 'end';
      const mockLogger = buildMockLogger();

      await closeRedisClient({
        client: mockClient as unknown as Redis,
        logger: mockLogger,
      });

      expect(mockClient.quit).not.toHaveBeenCalled();
      expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
    });

    it('在 quit 抛错时应吞掉异常并以 warn 日志记录', async () => {
      const mockClient = new MockRedisClient([]);
      mockClient.status = 'ready';
      mockClient.quit.mockImplementationOnce(
        async () => await Promise.reject(new Error('quit-failed')),
      );
      const mockLogger = buildMockLogger();

      await expect(
        closeRedisClient({
          client: mockClient as unknown as Redis,
          logger: mockLogger,
        }),
      ).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'redis_close_warn' }),
        expect.any(String),
      );
    });
  });
});
