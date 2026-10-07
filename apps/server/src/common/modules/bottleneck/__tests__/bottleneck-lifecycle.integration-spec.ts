import { BottleneckService } from '@/common/modules/bottleneck/bottleneck.service';
import type { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const REDIS_PASSWORD = 'integration-only-password';

describe('Bottleneck Redis 生命周期集成验证', () => {
  let container: StartedTestContainer;
  let observer: Redis;
  const services: BottleneckService[] = [];

  function createService(password = REDIS_PASSWORD) {
    const service = new BottleneckService(
      {
        getOrThrow: () => ({
          mode: 'redis',
          keyPrefix: 'bottleneck-integration',
          connection: {
            mode: 'single',
            single: {
              host: container.getHost(),
              port: container.getMappedPort(6379),
              password,
              db: 3,
            },
          },
        }),
      } as unknown as ConfigService,
      {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as PinoLogger,
    );
    services.push(service);
    return service;
  }

  async function countConnections(): Promise<number> {
    const clients = await observer.client('LIST');
    return String(clients).trim().split('\n').length;
  }

  beforeAll(async () => {
    container = await new GenericContainer('redis:8-alpine')
      .withCommand(['redis-server', '--requirepass', REDIS_PASSWORD])
      .withExposedPorts(6379)
      .start();
    observer = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
      password: REDIS_PASSWORD,
    });
    await observer.ping();
  }, 120_000);

  afterAll(async () => {
    for (const service of services) await service.onModuleDestroy();
    observer?.disconnect();
    await container?.stop();
  }, 120_000);

  it('应建立两条连接、调度真实任务，并在重复销毁后释放全部连接', async () => {
    const baseline = await countConnections();
    const service = createService();
    try {
      await service.onModuleInit();
      expect(await countConnections()).toBe(baseline + 2);
      const result = await service.schedule(
        'normal',
        async () => await Promise.resolve('完成'),
        { maxConcurrent: 1, reservoir: 5 },
      );
      expect(result).toBe('完成');
      expect(await service.currentReservoir('normal')).toBe(4);
    } finally {
      await service.onModuleDestroy();
      await service.onModuleDestroy();
    }
    await vi.waitFor(async () => {
      expect(await countConnections()).toBe(baseline);
    });
  });

  it('错误凭据应拒绝初始化并释放两条重试连接', async () => {
    const baseline = await countConnections();
    const service = createService('incorrect-integration-password');

    await expect(service.onModuleInit()).rejects.toThrow('WRONGPASS');

    await vi.waitFor(async () => {
      expect(await countConnections()).toBe(baseline);
    });
  });

  it('销毁保持原有断开语义，不等待或取消已经执行的业务函数', async () => {
    const baseline = await countConnections();
    const service = createService();
    await service.onModuleInit();
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    let complete!: () => void;
    const completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    let executed = false;
    const result = service.schedule('running', async () => {
      notifyStarted();
      await completion;
      executed = true;
      return '已执行';
    });
    try {
      await started;
      await service.onModuleDestroy();
      expect(executed).toBe(false);
    } finally {
      complete();
      expect(await result).toBe('已执行');
    }
    await vi.waitFor(async () => {
      expect(await countConnections()).toBe(baseline);
    });
  });
});
