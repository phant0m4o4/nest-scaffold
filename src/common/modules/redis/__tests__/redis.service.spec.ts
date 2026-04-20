/* eslint-disable @typescript-eslint/unbound-method */
import type { RedisConfigType } from '@/configs/redis.config';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { getLoggerToken, type PinoLogger } from 'nestjs-pino';

jest.mock('../redis.factory', () => ({
  createRedisClient: jest.fn(),
  closeRedisClient: jest.fn(async () => await Promise.resolve()),
}));

import { closeRedisClient, createRedisClient } from '../redis.factory';
import { RedisService } from '../redis.service';
import type { RedisClient } from '../redis.types';

/**
 * Redis 客户端测试替身：仅覆盖 `ping` 与状态字段
 */
class MockRedisClient extends EventEmitter {
  public status = 'ready';
  public ping = jest.fn(async () => await Promise.resolve('PONG'));
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

describe('RedisService', () => {
  let testingModule: TestingModule;
  let redisService: RedisService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: jest.Mocked<PinoLogger>;
  let mockClient: MockRedisClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockClient = new MockRedisClient();
    (createRedisClient as jest.Mock).mockReturnValue(
      mockClient as unknown as RedisClient,
    );
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue(defaultRedisConfig),
    } as unknown as jest.Mocked<ConfigService>;
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
