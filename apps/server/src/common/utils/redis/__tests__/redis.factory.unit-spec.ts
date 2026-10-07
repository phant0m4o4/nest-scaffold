import type { RedisConnectionConfig } from '@/common/utils/redis/redis-connection';
import { EventEmitter } from 'events';
import type { PinoLogger } from 'nestjs-pino';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type Mocked,
} from 'vitest';

/**
 * 用 EventEmitter 充当 ioredis 的 Redis 实例
 *
 * 暴露：
 * - status：模拟客户端连接状态
 * - quit / disconnect：vi mock，便于断言关闭分支
 * - constructorArgs：保留构造时透传的参数，用于断言配置映射
 */
class MockRedisClient extends EventEmitter {
  public status = 'ready';
  public readonly quit = vi.fn(async () => await Promise.resolve('OK'));
  public readonly disconnect = vi.fn();
  public constructor(public readonly constructorArgs: unknown[] = []) {
    super();
  }
}

const { redisInstances } = vi.hoisted(() => ({
  redisInstances: [] as unknown[],
}));

vi.mock('ioredis', () => {
  // 工厂在 'ioredis' 首次被导入时才执行（惰性）；ESM 按声明顺序求值，
  // 顶层的 MockRedisClient 类定义先于下方 'ioredis' 导入完成初始化，
  // 此处可安全引用，无需动态 import
  // 注意：实现必须是普通 function（可被 new 调用），箭头函数不可作为构造函数
  return {
    Redis: vi.fn(function (...args: unknown[]) {
      const instance = new MockRedisClient(args);
      redisInstances.push(instance);
      return instance;
    }),
  };
});

import { Redis } from 'ioredis';

import { closeRedisClient, createRedisClient } from '../redis.factory';

/**
 * 构造一个仅断言所需方法的 PinoLogger 测试替身
 */
function buildMockLogger(): Mocked<PinoLogger> {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  } as unknown as Mocked<PinoLogger>;
}

describe('redis.factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisInstances.length = 0;
  });

  afterEach(() => vi.useRealTimers());

  describe('createRedisClient', () => {
    it('在 single 模式下应使用 Redis 构造函数透传 host/port/password/db', () => {
      const inputConfig: RedisConnectionConfig = {
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

      const expectedRedisCtor = Redis as unknown as Mock;
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
      const inputConfig: RedisConnectionConfig = {
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

      const expectedRedisCtor = Redis as unknown as Mock;
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

    it('在客户端 emit error 事件时应通过 logger.error 输出结构化日志', () => {
      const inputConfig: RedisConnectionConfig = {
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
      const inputConfig: RedisConnectionConfig = {
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
    it.each(['resolve', 'reject'] as const)(
      'quit 提前 %s 时应立即清理关闭超时计时器',
      async (settlement) => {
        vi.useFakeTimers();
        const client = new MockRedisClient();
        if (settlement === 'reject') {
          client.quit.mockRejectedValueOnce(new Error('quit-failed'));
        }

        await closeRedisClient({
          client: client as unknown as Redis,
          logger: buildMockLogger(),
        });

        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it('quit 永不结束时应在 5 秒后强制断开并清理计时器', async () => {
      vi.useFakeTimers();
      const client = new MockRedisClient();
      client.quit.mockImplementationOnce(() => new Promise(() => {}));
      const logger = buildMockLogger();
      const close = closeRedisClient({
        client: client as unknown as Redis,
        logger,
      });

      await vi.advanceTimersByTimeAsync(5_000);
      await close;

      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'redis_close_warn' }),
        expect.any(String),
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it('在客户端 status 为 ready 时应调用 quit 并打印平滑关闭日志', async () => {
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
        expect.stringContaining('平滑关闭'),
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
