import type { RedisConfigType } from '@/configs/redis.config';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { getLoggerToken, type PinoLogger } from 'nestjs-pino';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mocked,
} from 'vitest';

vi.mock('../redis.factory', () => ({
  createRedisClient: vi.fn(),
  closeRedisClient: vi.fn(async () => await Promise.resolve()),
}));

import { closeRedisClient, createRedisClient } from '../redis.factory';
import { RedisService } from '../redis.service';
import type { RedisClient } from '../redis.types';

/**
 * Redis 客户端测试替身：仅覆盖 `ping` 与状态字段
 */
class MockRedisClient extends EventEmitter {
  public status = 'ready';
  public ping = vi.fn(async () => await Promise.resolve('PONG'));
}

/**
 * 默认 single 模式配置，便于不同测试用例复用
 */
const defaultRedisConfig: RedisConfigType = {
  mode: 'single',
  single: { host: '127.0.0.1', port: 6379, db: 0 },
};

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

describe('RedisService', () => {
  let testingModule: TestingModule;
  let redisService: RedisService;
  let mockConfigService: Mocked<ConfigService>;
  let mockLogger: Mocked<PinoLogger>;
  let mockClient: MockRedisClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = new MockRedisClient();
    vi.mocked(createRedisClient).mockReturnValue(
      mockClient as unknown as RedisClient,
    );
    mockConfigService = {
      getOrThrow: vi.fn().mockReturnValue(defaultRedisConfig),
    } as unknown as Mocked<ConfigService>;
    mockLogger = buildMockLogger();
    testingModule = await Test.createTestingModule({
      providers: [RedisService],
    })
      .useMocker((token) => {
        if (token === ConfigService) {
          return mockConfigService;
        }
        if (token === getLoggerToken(RedisService.name)) {
          return mockLogger;
        }
        return undefined;
      })
      .compile();
    redisService = testingModule.get(RedisService);
  });

  afterEach(async () => {
    await testingModule.close();
  });

  describe('onModuleInit', () => {
    it('在 ping 返回 PONG 时应初始化客户端并打印健康检查日志', async () => {
      await redisService.onModuleInit();

      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('redis');
      expect(createRedisClient).toHaveBeenCalledWith({
        config: defaultRedisConfig,
        logger: mockLogger,
      });
      expect(mockClient.ping).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('健康检查通过'),
      );
      expect(redisService.getClient()).toBe(mockClient);
    });

    it('在 ping 返回非 PONG 时应抛错并通过 logger.error 记录', async () => {
      mockClient.ping.mockImplementationOnce(
        async () => await Promise.resolve('UNEXPECTED'),
      );

      await expect(redisService.onModuleInit()).rejects.toThrow(
        /Redis PING 响应异常/,
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'redis_ping_failed' }),
        expect.any(String),
      );
    });

    it('在 ping 抛错时应记录 error 日志并向上抛出', async () => {
      const inputError = new Error('connection-refused');
      mockClient.ping.mockImplementationOnce(
        async () => await Promise.reject(inputError),
      );

      await expect(redisService.onModuleInit()).rejects.toBe(inputError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'redis_ping_failed',
          error: inputError,
        }),
        expect.any(String),
      );
    });
  });

  describe('getClient', () => {
    it('在初始化前调用应抛出未初始化错误', () => {
      expect(() => redisService.getClient()).toThrow(/尚未初始化/);
    });

    it('在初始化后应返回 factory 创建的客户端实例', async () => {
      await redisService.onModuleInit();

      const actualClient = redisService.getClient();

      expect(actualClient).toBe(mockClient);
    });
  });

  describe('onModuleDestroy', () => {
    it('在客户端已初始化时应委托 closeRedisClient 关闭', async () => {
      await redisService.onModuleInit();

      await redisService.onModuleDestroy();

      expect(closeRedisClient).toHaveBeenCalledWith({
        client: mockClient,
        logger: mockLogger,
      });
      expect(() => redisService.getClient()).toThrow(/尚未初始化/);
    });

    it('在客户端尚未初始化时不应调用 closeRedisClient', async () => {
      await redisService.onModuleDestroy();

      expect(closeRedisClient).not.toHaveBeenCalled();
    });
  });
});
