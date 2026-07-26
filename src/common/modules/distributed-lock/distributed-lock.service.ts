import { normalizeError } from '@/common/utils/normalize-error';
import {
  closeRedisClient,
  createRedisClient,
} from '@/common/utils/redis/redis.factory';
import type { RedisClient } from '@/common/utils/redis/redis.types';
import { DistributedLockConfigType } from '@/configs/distributed-lock.config';
import type { RedisConnectionConfig } from '@/configs/redis.config';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redlock, {
  type RedlockAbortSignal,
  type Settings as RedlockSettings,
} from 'redlock';

/** 对外复用 redlock 的 RedlockAbortSignal 类型 */
export type { RedlockAbortSignal };

/** 使用时的默认 TTL（毫秒），未传 ttlMs 时使用 */
const DEFAULT_TTL_MS = 30_000;
/**
 * Redlock 实例默认参数（using 内可通过 options 覆盖）
 *
 * driftFactor 采用 redlock 官方默认值 0.01（=1%），对应 Redlock 论文假设；
 * 过小（如 0.001）会在有效期估算中低估时钟漂移，极端情况下可能导致两个持有者同时视为锁有效。
 */
const DEFAULT_REDLOCK_SETTINGS: Partial<RedlockSettings> = {
  driftFactor: 0.01, // 时钟漂移系数（对齐 Redlock 官方默认）
  retryCount: 10, // 重试次数
  retryDelay: 200, // 重试间隔（毫秒）
  retryJitter: 200, // 重试抖动（毫秒）
  automaticExtensionThreshold: 500, // 自动续期阈值（毫秒）
};

/**
 * 单次 using 调用时可自定义的参数（Redlock 行为 + 可选中止信号）
 * - driftFactor: 时钟漂移系数
 * - retryCount: 重试次数
 * - retryDelay: 重试间隔（毫秒）
 * - retryJitter: 重试抖动（毫秒）
 * - automaticExtensionThreshold: 自动续期阈值（毫秒）
 * - signal: 可选 AbortSignal，用于外部中断
 */
export type DistributedLockUsingOptions = Partial<RedlockSettings> & {
  signal?: AbortSignal;
};

/**
 * 分布式锁服务
 *
 * 基于 Redlock 算法实现分布式锁。锁持有**独立的 Redis 连接**
 * （`DISTRIBUTED_LOCK_REDIS_DB`，默认 0；地址/密码复用 `REDIS_*` 基础配置），
 * 与缓存等可随时清空的数据隔离，避免共享客户端被其他使用方影响。
 *
 * 存放锁的 Redis 必须 `maxmemory-policy noeviction` 并开启持久化；
 * cluster 模式无 DB 概念，隔离需部署独立实例/集群（见 README）。
 *
 * 支持：
 * - 自动重试和超时处理
 * - 锁的自动续期
 * - 死锁检测和预防
 */
@Injectable()
export class DistributedLockService implements OnModuleInit, OnModuleDestroy {
  private _client!: RedisClient;
  private _redlock!: Redlock;
  private readonly _keyPrefix: string;
  private readonly _redisDb: number;

  constructor(
    private readonly _configService: ConfigService,
    @InjectPinoLogger(DistributedLockService.name)
    private readonly _logger: PinoLogger,
  ) {
    const distributedLockConfig =
      this._configService.getOrThrow<DistributedLockConfigType>(
        'distributedLock',
      );
    this._keyPrefix = distributedLockConfig.keyPrefix;
    this._redisDb = distributedLockConfig.redisDb;
  }

  async onModuleInit(): Promise<void> {
    const redisConfig =
      this._configService.getOrThrow<RedisConnectionConfig>('redis');
    this._client = createRedisClient({
      config: this._buildLockRedisConfig(redisConfig),
      logger: this._logger,
    });
    try {
      const reply = await this._client.ping();
      if (reply !== 'PONG') {
        throw new Error(`锁 Redis PING 响应异常: ${String(reply)}`);
      }
    } catch (error: unknown) {
      this._logger.error(
        { event: 'lock_redis_ping_failed', error: normalizeError(error) },
        '分布式锁 Redis 健康检查失败',
      );
      throw error;
    }
    this._redlock = new Redlock([this._client], DEFAULT_REDLOCK_SETTINGS);
    this._redlock.on('error', (error: unknown) => {
      this._logger.error(
        { error: normalizeError(error), event: 'redlock_error' },
        'Redlock 错误',
      );
    });
    this._redlock.on('clientError', (error: unknown) => {
      this._logger.error(
        {
          error: normalizeError(error),
          event: 'redis_client_error',
        },
        'Redlock Redis 客户端错误',
      );
    });
    this._logger.info(
      { event: 'lock_ready', db: this._redisDb },
      '分布式锁服务初始化完成（独立 Redis 连接）',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (!this._client) {
      return;
    }
    await closeRedisClient({ client: this._client, logger: this._logger });
  }

  /**
   * 将共享 Redis 基础配置改写为锁专用配置（独立 DB）
   *
   * cluster 模式没有 DB 概念，无法用 DB 隔离，原样返回并输出告警
   * （生产环境应为锁部署独立实例/集群）。
   * @private
   */
  private _buildLockRedisConfig(
    config: RedisConnectionConfig,
  ): RedisConnectionConfig {
    if (config.mode === 'single') {
      return { ...config, single: { ...config.single, db: this._redisDb } };
    }
    if (config.mode === 'sentinel') {
      return {
        ...config,
        sentinel: { ...config.sentinel, db: this._redisDb },
      };
    }
    this._logger.warn(
      { event: 'lock_cluster_no_db_isolation' },
      'cluster 模式无 DB 概念，锁无法通过 DB 与其他服务隔离，生产环境请为锁部署独立实例/集群',
    );
    return config;
  }

  /**
   * 构建完整的锁键名（带前缀）
   * @private
   */
  private _buildLockKey(resource: string): string {
    if (!resource) {
      throw new Error('资源标识符必须是非空字符串');
    }
    return `${this._keyPrefix}:${resource}`;
  }

  /**
   * 将单个或多个资源转为带前缀的键数组
   * @private
   */
  private _buildLockKeys(resources: string | string[]): string[] {
    const list = Array.isArray(resources) ? resources : [resources];
    if (list.length === 0) {
      throw new Error('资源标识符数组不能为空');
    }
    return list.map((r) => this._buildLockKey(String(r)));
  }

  /**
   * 在分布式锁保护下执行回调
   *
   * 调用时可自定义：
   * - resources：资源键（不带前缀）
   * - ttlMs：锁 TTL（毫秒），默认 30_000
   * - options：Redlock 行为与中止信号，见 {@link DistributedLockUsingOptions}
   *
   * @typeParam T 回调返回类型
   * @param params.resources 资源键（不带前缀），单个字符串或字符串数组
   * @param params.execute 受锁保护的执行函数，可接收 RedlockAbortSignal
   * @param params.ttlMs 可选，锁 TTL（毫秒），默认 30000
   * @param params.options 可选，重试/续期/漂移/AbortSignal 等，见 DistributedLockUsingOptions
   * @returns 回调的返回结果
   */
  async using<T>(params: {
    resources: string | string[];
    execute: (signal?: RedlockAbortSignal) => Promise<T> | T;
    ttlMs?: number;
    options?: DistributedLockUsingOptions;
  }): Promise<T> {
    const { resources, execute, ttlMs, options } = params;
    const keys = this._buildLockKeys(resources);
    const ttl = ttlMs ?? DEFAULT_TTL_MS;
    return this._redlock.using(keys, ttl, options ?? {}, (signal) =>
      Promise.resolve(execute(signal)),
    );
  }
}
