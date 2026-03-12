import { normalizeError } from '@/common/utils/normalize-error';
import { DistributedLockConfigType } from '@/configs/distributed-lock.config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redlock, {
  type RedlockAbortSignal,
  type Settings as RedlockSettings,
} from 'redlock';

/** 对外复用 redlock 的 RedlockAbortSignal 类型 */
export type { RedlockAbortSignal };

/** 使用时的默认 TTL（毫秒），未传 ttlMs 时使用 */
const DEFAULT_TTL_MS = 30_000;
/** Redlock 实例的默认参数（创建 Redlock 时使用，using 内可通过 options 覆盖） */
const DEFAULT_REDLOCK_SETTINGS: Partial<RedlockSettings> = {
  driftFactor: 0.001, // 时钟漂移系数
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
 * 基于 Redlock 算法实现分布式锁，支持：
 * - 多 Redis 实例的容错机制
 * - 自动重试和超时处理
 * - 锁的自动续期
 * - 死锁检测和预防
 */
@Injectable()
export class DistributedLockService implements OnModuleInit, OnModuleDestroy {
  private readonly _redlock: Redlock;
  private readonly _redis: Redis;
  private readonly _keyPrefix: string;

  constructor(
    private readonly _configService: ConfigService,
    @InjectPinoLogger(DistributedLockService.name)
    private readonly _logger: PinoLogger,
  ) {
    const distributedLockConfig =
      this._configService.getOrThrow<DistributedLockConfigType>(
        'distributedLock',
      );
    const { redis, keyPrefix } = distributedLockConfig;
    this._redis = new Redis(redis);
    this._redlock = new Redlock([this._redis], DEFAULT_REDLOCK_SETTINGS);
    this._keyPrefix = keyPrefix;
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
  }

  async onModuleInit(): Promise<void> {
    try {
      await this._redis.ping();
      this._logger.info('分布式锁 Redis 连接成功');
    } catch (error: unknown) {
      this._logger.error(
        {
          error: normalizeError(error),
          event: 'distributed_lock_redis_connect_failed',
        },
        '分布式锁 Redis 连接失败',
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this._redlock.quit();
      this._logger.info('分布式锁连接已关闭');
    } catch (error: unknown) {
      this._logger.warn(
        {
          error: normalizeError(error),
          event: 'distributed_lock_close_warn',
        },
        '关闭分布式锁连接时发生错误',
      );
    }
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
    if (typeof execute !== 'function') {
      throw new Error('execute 必须是可执行的函数');
    }
    const keys = this._buildLockKeys(resources);
    const ttl = ttlMs ?? DEFAULT_TTL_MS;
    return this._redlock.using(keys, ttl, options ?? {}, (signal) =>
      Promise.resolve(execute(signal)),
    );
  }
}
