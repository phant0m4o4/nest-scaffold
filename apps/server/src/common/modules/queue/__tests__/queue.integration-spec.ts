import queueConfig, { type QueueConfigType } from '@/configs/queue.config';
import { getQueueToken, Processor, WorkerHost } from '@nestjs/bullmq';
import type { DynamicModule, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { QueueModule } from '../queue.module';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function withinTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('队列测试操作超过 10 秒')),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('队列与真实单节点 Redis', () => {
  let container: StartedTestContainer | undefined;

  function config(): QueueConfigType {
    return {
      keyPrefix: `queue-test-${randomUUID()}`,
      dashboardRoute: '/queues',
      connection: {
        mode: 'single',
        single: {
          host: container!.getHost(),
          port: container!.getMappedPort(6379),
          db: 2,
        },
      },
    };
  }

  async function createModule(
    configuration: QueueConfigType,
    registration: DynamicModule,
    providers: Type<unknown>[] = [],
  ): Promise<TestingModule> {
    return Test.createTestingModule({
      imports: [QueueModule, registration],
      providers,
    })
      .overrideProvider(queueConfig.KEY)
      .useValue(configuration)
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ queue: configuration }))
      .compile();
  }

  beforeAll(async () => {
    container = await new GenericContainer('redis:8-alpine')
      .withExposedPorts(6379)
      .start();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('应用关闭应等待正在执行的任务完成，并由 BullMQ 释放队列和 Worker 连接', async () => {
    const entered = deferred();
    const release = deferred();
    const closing = deferred();
    const events: string[] = [];
    const errors: Error[] = [];
    @Processor('audit')
    class AuditProcessor extends WorkerHost {
      async process(): Promise<string> {
        entered.resolve();
        await release.promise;
        return 'done';
      }
    }
    const module = await createModule(
      config(),
      QueueModule.registerQueue({ name: 'audit' }),
      [AuditProcessor],
    );
    let shutdown: Promise<void> | undefined;
    try {
      await module.init();
      const worker = module.get(AuditProcessor).worker;
      worker.on('error', (error) => errors.push(error));
      worker.on('completed', () => events.push('job-completed'));
      worker.on('closed', () => events.push('worker-closed'));
      worker.once('closing', () => closing.resolve());
      const queue = module.get<Queue>(getQueueToken('audit'));
      const queueClient = await queue.client;
      const workerClient = await worker.client;
      await queue.add('待完成任务', {});
      await withinTimeout(entered.promise);
      shutdown = module.close();
      await withinTimeout(closing.promise);
      expect(events).not.toContain('worker-closed');
      release.resolve();
      await withinTimeout(shutdown);

      expect(errors).toEqual([]);
      expect(events).toEqual(['job-completed', 'worker-closed']);
      await vi.waitFor(() => {
        expect(queueClient.status).toBe('end');
        expect(workerClient.status).toBe('end');
      });
    } finally {
      release.resolve();
      await withinTimeout(shutdown ?? module.close());
    }
  });

  it.each([
    ['sync', undefined],
    ['sync', 'audit'],
    ['async', undefined],
    ['async', 'audit'],
  ] as const)(
    '%s 队列 %s：重新装配应保留未指定的旧限制，并以 0 清除',
    async (mode, name) => {
      const configuration = config();
      for (const limit of [2, undefined, 0]) {
        const option = { name, globalConcurrency: limit };
        const registration =
          mode === 'sync'
            ? QueueModule.registerQueue(option)
            : QueueModule.registerQueueAsync({
                ...option,
                useFactory: () => ({}),
              });
        const module = await createModule(configuration, registration);
        try {
          const queue = module.get<Queue>(getQueueToken(name));
          await expect(queue.getGlobalConcurrency()).resolves.toBe(
            limit === 0 ? null : 2,
          );
        } finally {
          await module.close();
        }
      }
    },
  );
});
