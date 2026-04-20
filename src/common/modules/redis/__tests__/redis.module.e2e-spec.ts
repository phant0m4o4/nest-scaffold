import type { RedisConfigType } from '@/configs/redis.config';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { RedisModule } from '../redis.module';
import { RedisService } from '../redis.service';

/** Redis 容器镜像 */
const REDIS_IMAGE = 'redis:7-alpine';
/** Redis 容器内端口 */
const REDIS_INNER_PORT = 6379;
/** 容器启动 / 测试整体超时（ms） */
const TEST_TIMEOUT_MS = 120_000;

/**
 * 集成测试：使用 testcontainers 启动真实 Redis，
 * 通过 overrideProvider(ConfigService) 注入容器地址，
 * 验证 RedisModule -> RedisService -> ioredis 的端到端可用性。
 */
describe('RedisModule (e2e)', () => {
  let redisContainer: StartedTestContainer;
  let testingModule: TestingModule;
  let redisService: RedisService;

  beforeAll(async () => {
    redisContainer = await new GenericContainer(REDIS_IMAGE)
      .withExposedPorts(REDIS_INNER_PORT)
      .start();
    const containerHost = redisContainer.getHost();
    const containerPort = redisContainer.getMappedPort(REDIS_INNER_PORT);
    const inputRedisConfig: RedisConfigType = {
      mode: 'single',
      single: { host: containerHost, port: containerPort, db: 0 },
    };
    const mockConfigService: Pick<ConfigService, 'getOrThrow'> = {
      getOrThrow: jest.fn().mockReturnValue(inputRedisConfig),
    } as unknown as Pick<ConfigService, 'getOrThrow'>;
    testingModule = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({ pinoHttp: { enabled: false } }),
        RedisModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();
    await testingModule.init();
    redisService = testingModule.get(RedisService);
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (testingModule) {
      await testingModule.close();
    }
    if (redisContainer) {
      await redisContainer.stop();
    }
  }, TEST_TIMEOUT_MS);

  it('应能通过 RedisService.getClient() 完成 set/get/delete', async () => {
    const client = redisService.getClient();
    const inputKey = 'redis-module-e2e:hello';
    const inputValue = 'world';

    await client.set(inputKey, inputValue);
    const actualValue = await client.get(inputKey);
    const actualDeleted = await client.del(inputKey);

    expect(actualValue).toBe(inputValue);
    expect(actualDeleted).toBe(1);
  });

  it('应能通过 PING 命令验证连接处于活跃状态', async () => {
    const client = redisService.getClient();

    const actualReply = await client.ping();

    expect(actualReply).toBe('PONG');
  });

  it('在 testingModule.close 后应将客户端连接置为 end 状态', async () => {
    const isolatedConfig: RedisConfigType = {
      mode: 'single',
      single: {
        host: redisContainer.getHost(),
        port: redisContainer.getMappedPort(REDIS_INNER_PORT),
        db: 0,
      },
    };
    const mockConfigService: Pick<ConfigService, 'getOrThrow'> = {
      getOrThrow: jest.fn().mockReturnValue(isolatedConfig),
    } as unknown as Pick<ConfigService, 'getOrThrow'>;
    const isolatedModule = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({ pinoHttp: { enabled: false } }),
        RedisModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();
    await isolatedModule.init();
    const isolatedService = isolatedModule.get(RedisService);
    const isolatedClient = isolatedService.getClient();

    await isolatedModule.close();
    // ioredis 在 quit 之后 status 可能短暂处于 'close' 再切到 'end'，
    // 此处轮询等待，避免微任务调度造成的不稳定
    for (let i = 0; i < 20 && isolatedClient.status !== 'end'; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }

    expect(['end', 'close']).toContain(isolatedClient.status);
  });
});
