import { EnvironmentEnum } from '@/common/enums/environment.enum';
import type { RedisConnectionConfig } from '@/common/utils/redis/redis-connection';
import queueConfig, { QueueConfigType } from '@/configs/queue.config';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import {
  BullModule,
  type RegisterQueueAsyncOptions,
  type RegisterQueueOptions,
  getQueueToken,
} from '@nestjs/bullmq';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { ConnectionOptions, Queue } from 'bullmq';
import { Cluster } from 'ioredis';

import type { IQueueConcurrencyOptions } from './interfaces/queue-concurrency-options.interface';

/**
 * 将模块自己的 Redis 连接配置映射为 BullMQ 连接选项
 *
 * - single / sentinel：以 ioredis 选项对象传入（BullMQ 内部自行创建连接）
 * - cluster：BullMQ 不接受 cluster 选项对象，需传入现成的 `Cluster` 实例；
 *   该实例由 BullMQ 复用/duplicate，生命周期随进程（队列为常驻服务）
 *
 * BullMQ worker 走 blocking 命令，必须 `maxRetriesPerRequest: null`。
 */
function buildBullMqConnection(
  connection: RedisConnectionConfig,
): ConnectionOptions {
  if (connection.mode === 'single') {
    return { ...connection.single, maxRetriesPerRequest: null };
  }
  if (connection.mode === 'sentinel') {
    const { masterName, sentinels, password, db } = connection.sentinel;
    return {
      name: masterName,
      sentinels: sentinels.map((node) => ({ ...node })),
      password,
      db,
      maxRetriesPerRequest: null,
    };
  }
  return new Cluster(
    connection.cluster.nodes.map((node) => ({ ...node })),
    {
      redisOptions: {
        password: connection.cluster.password,
        maxRetriesPerRequest: null,
      },
    },
  );
}

/** 队列同步注册选项（扩展 BullMQ 原生选项，支持全局并发控制） */
type QueueRegisterOptions = RegisterQueueOptions & IQueueConcurrencyOptions;

/** 队列异步注册选项（扩展 BullMQ 原生选项，支持全局并发控制） */
type QueueRegisterAsyncOptions = RegisterQueueAsyncOptions &
  IQueueConcurrencyOptions;

/**
 * 队列模块
 *
 * 封装 BullMQ + Bull Board，提供统一的队列注册入口：
 * - 根模块自动通过 ConfigService 读取 `QUEUE_REDIS_*` 连接配置（独立于其他模块的 Redis 连接，
 *   BullMQ worker 使用 blocking / subscribe 命令，必须独享连接）
 * - 如果希望复用全局 Redis 的地址，可在 .env 中引用变量：`QUEUE_REDIS_HOST=${REDIS_HOST}`
 * - 开发环境自动启用 Bull Board 仪表盘（路由可配）
 * - 通过 registerQueue / registerQueueAsync 注册业务队列，
 *   开发环境自动将队列注册到 Bull Board
 * - 支持通过 globalConcurrency 选项设置跨进程全局并发限制
 * @see README.md 查看完整使用示例与配置说明
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule.forFeature(queueConfig)],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<QueueConfigType>('queue');
        return {
          prefix: config.keyPrefix,
          connection: buildBullMqConnection(config.connection),
        };
      },
    }),
    ...(process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT
      ? [
          BullBoardModule.forRootAsync({
            imports: [ConfigModule.forFeature(queueConfig)],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
              const config = configService.getOrThrow<QueueConfigType>('queue');
              return {
                route: config.dashboardRoute,
                adapter: ExpressAdapter,
              };
            },
          }),
        ]
      : []),
  ],
  exports: [BullModule],
})
export class QueueModule {
  /**
   * 同步注册业务队列
   * @param options 一个或多个队列注册选项（支持 globalConcurrency）
   * @returns 包含队列 Provider 的动态模块
   */
  static registerQueue(...options: QueueRegisterOptions[]): DynamicModule {
    const bullDynamicModule = BullModule.registerQueue(...options);
    const queueNames = QueueModule._extractQueueNames(options);
    const concurrencyProviders =
      QueueModule._buildConcurrencyProviders(options);
    return QueueModule._buildDynamicModule(
      bullDynamicModule,
      queueNames,
      concurrencyProviders,
    );
  }

  /**
   * 异步注册业务队列
   * @param options 一个或多个异步队列注册选项（支持 globalConcurrency）
   * @returns 包含队列 Provider 的动态模块
   */
  static registerQueueAsync(
    ...options: QueueRegisterAsyncOptions[]
  ): DynamicModule {
    const bullDynamicModule = BullModule.registerQueueAsync(...options);
    const queueNames = QueueModule._extractQueueNames(options);
    const concurrencyProviders =
      QueueModule._buildConcurrencyProviders(options);
    return QueueModule._buildDynamicModule(
      bullDynamicModule,
      queueNames,
      concurrencyProviders,
    );
  }

  /** 从注册选项中提取有效队列名称 */
  private static _extractQueueNames(
    options: Array<{ name?: string }>,
  ): string[] {
    return options
      .map((option) => option.name)
      .filter(
        (name): name is string => typeof name === 'string' && name.length > 0,
      );
  }

  /**
   * 为指定了 globalConcurrency 的队列创建初始化 Provider。
   * 模块初始化时 NestJS 会实例化这些 Provider，
   * 从而通过 Queue.setGlobalConcurrency() 在 Redis 层面设置全局并发限制。
   */
  private static _buildConcurrencyProviders(
    options: Array<{ name?: string } & IQueueConcurrencyOptions>,
  ): Provider[] {
    return options
      .filter(
        (
          opt,
        ): opt is { name: string; globalConcurrency: number } & typeof opt =>
          typeof opt.name === 'string' &&
          opt.name.length > 0 &&
          typeof opt.globalConcurrency === 'number' &&
          opt.globalConcurrency > 0,
      )
      .map((opt) => ({
        provide: Symbol(`QueueGlobalConcurrency:${opt.name}`),
        useFactory: async (queue: Queue) => {
          await queue.setGlobalConcurrency(opt.globalConcurrency);
        },
        inject: [getQueueToken(opt.name)],
      }));
  }

  /**
   * 构建最终动态模块
   * - 开发环境自动注册 Bull Board
   * - 包含全局并发初始化 Provider
   */
  private static _buildDynamicModule(
    bullDynamicModule: DynamicModule,
    queueNames: string[],
    concurrencyProviders: Provider[],
  ): DynamicModule {
    const isDev = process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT;
    const hasBoardFeatures = isDev && queueNames.length > 0;
    const hasConcurrency = concurrencyProviders.length > 0;
    if (!hasBoardFeatures && !hasConcurrency) {
      return bullDynamicModule;
    }
    const imports: DynamicModule[] = [bullDynamicModule];
    if (hasBoardFeatures) {
      imports.push(
        BullBoardModule.forFeature(
          ...queueNames.map((name) => ({ name, adapter: BullMQAdapter })),
        ),
      );
    }
    return {
      module: QueueModule,
      imports,
      providers: concurrencyProviders,
      exports: [bullDynamicModule],
    };
  }
}
