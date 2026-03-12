import { BottleneckConfigType } from '@/configs/bottleneck.config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bottleneck from 'bottleneck';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  IBottleneckConnection,
  IBottleneckLimiter,
  IBottleneckOptions,
} from './interfaces/bottleneck-client.interface';

/**
 * Bottleneck 限流服务
 *
 * 基于 bottleneck 库实现的通用限流服务，支持：
 * - 内存模式：单机限流，使用内存存储
 * - Redis 模式：分布式限流，使用 Redis 存储，支持多实例共享限流状态
 *
 * 主要功能：
 * - 并发控制：限制同时执行的任务数量
 * - 速率限制：控制任务执行的频率
 * - 令牌桶算法：支持突发流量处理
 * - 优先级队列：支持任务优先级调度
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Injectable()
export class BottleneckService implements OnModuleInit, OnModuleDestroy {
  /** 限流器实例缓存 Map（key: 限流器标识符, value: Bottleneck 实例） */
  private readonly _limiters: Map<string, IBottleneckLimiter> = new Map();

  /** Bottleneck IORedisConnection 实例（仅 Redis 模式），所有限流器共享 */
  private _bottleneckConnection: IBottleneckConnection | null = null;

  /** 当前运行模式 */
  private readonly _mode: 'redis' | 'memory';

  /** Redis 连接配置（仅 Redis 模式） */
  private readonly _redisConfig: {
    host: string;
    port: number;
    password?: string;
    db: number;
  } | null;

  /** Redis key 前缀 */
  private readonly _keyPrefix: string;

  constructor(
    private readonly _configService: ConfigService,
    @InjectPinoLogger(BottleneckService.name)
    private readonly _logger: PinoLogger,
  ) {
    const config =
      this._configService.getOrThrow<BottleneckConfigType>('bottleneck');
    this._mode = config.mode;
    this._keyPrefix = config.keyPrefix;
    this._redisConfig =
      this._mode === 'redis'
        ? {
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            db: config.redis.db,
          }
        : null;
    this._logger.info(
      { event: 'bottleneck_service_created', mode: this._mode },
      `Bottleneck 服务已创建，模式: ${this._mode}`,
    );
  }

  /**
   * 模块初始化 — Redis 模式下创建 IORedisConnection
   */
  async onModuleInit(): Promise<void> {
    if (this._mode !== 'redis' || !this._redisConfig) {
      return;
    }
    try {
      this._bottleneckConnection = this._createConnection();
      this._bottleneckConnection.on('error', (error) => {
        this._logger.error(
          {
            error: this._normalizeError(error),
            event: 'bottleneck_connection_error',
          },
          'Bottleneck Connection 连接错误',
        );
      });
      await this._resolveReady(this._bottleneckConnection);
      this._logger.info('Bottleneck Redis 连接已创建');
    } catch (error: unknown) {
      this._logger.error(
        {
          error: this._normalizeError(error),
          event: 'bottleneck_redis_connect_failed',
        },
        'Bottleneck Redis 连接失败',
      );
      throw error;
    }
  }

  /**
   * 模块销毁 — 清理所有限流器实例和 Redis 连接
   */
  async onModuleDestroy(): Promise<void> {
    await this._disconnectAllLimiters();
    this._limiters.clear();
    await this._closeConnection();
    this._logger.info('Bottleneck 服务已销毁');
  }

  /**
   * 创建或获取限流器实例
   *
   * 如果指定 key 的限流器已存在，则返回现有实例；否则创建新实例。
   *
   * @param key 限流器的唯一标识符
   * @param options 可选的 Bottleneck 配置，覆盖默认行为
   * @returns Bottleneck 限流器实例
   */
  public createLimiter(
    key: string,
    options?: IBottleneckOptions,
  ): IBottleneckLimiter {
    if (!key || typeof key !== 'string') {
      throw new Error('限流器 key 必须是非空字符串');
    }
    const existingLimiter = this._limiters.get(key);
    if (existingLimiter) {
      this._logger.debug(
        { event: 'limiter_reused', key },
        `复用现有限流器: ${key}`,
      );
      return existingLimiter;
    }
    const limiterOptions: IBottleneckOptions = { ...options };
    if (this._mode === 'redis') {
      if (!this._bottleneckConnection) {
        throw new Error('Redis 连接未初始化，无法创建 Redis 模式的限流器');
      }
      Object.assign(limiterOptions, {
        connection: this._bottleneckConnection,
        id: this._buildRedisKey(key),
      });
    }
    const BottleneckCtor = Bottleneck as unknown as new (
      opts: Record<string, unknown>,
    ) => IBottleneckLimiter;
    const limiter = new BottleneckCtor(
      limiterOptions as Record<string, unknown>,
    );
    this._setupLimiterEvents(limiter, key);
    this._limiters.set(key, limiter);
    this._logger.info(
      {
        event: 'limiter_created',
        key,
        mode: this._mode,
      },
      `限流器已创建: ${key}`,
    );
    return limiter;
  }

  /**
   * 包装异步函数，自动应用限流
   *
   * @param key 限流器的唯一标识符
   * @param fn 要执行的异步/同步函数
   * @param options Bottleneck 配置选项
   * @returns 函数执行结果
   */
  public async wrap<T>(
    key: string,
    fn: () => Promise<T> | T,
    options?: IBottleneckOptions,
  ): Promise<T> {
    const limiter = this.createLimiter(key, options);
    await this._waitForLimiterReady(limiter, key);
    const wrappedFn = limiter.wrap(() => Promise.resolve(fn()));
    return await wrappedFn();
  }

  /**
   * 调度任务执行（提供优先级、权重等更细粒度控制）
   *
   * @param key 限流器的唯一标识符
   * @param fn 要执行的异步/同步函数
   * @param options Bottleneck 配置选项
   * @returns 函数执行结果
   */
  public async schedule<T>(
    key: string,
    fn: () => Promise<T> | T,
    options?: IBottleneckOptions,
  ): Promise<T> {
    const limiter = this.createLimiter(key, options);
    await this._waitForLimiterReady(limiter, key);
    return await limiter.schedule(() => Promise.resolve(fn()));
  }

  /**
   * 获取当前排队和执行中的任务数
   *
   * @param key 限流器的唯一标识符
   * @returns 当前任务数（排队 + 执行中），限流器不存在则返回 0
   */
  public count(key: string): number {
    const limiter = this._limiters.get(key);
    if (!limiter) {
      return 0;
    }
    const counts = limiter.counts();
    return counts.RUNNING + counts.QUEUED;
  }

  /**
   * 获取当前令牌桶剩余令牌数
   *
   * @param key 限流器的唯一标识符
   * @returns 剩余令牌数，限流器不存在则返回 null
   */
  public async currentReservoir(key: string): Promise<number | null> {
    const limiter = this._limiters.get(key);
    if (!limiter) {
      return null;
    }
    await this._waitForLimiterReady(limiter, key);
    return limiter.currentReservoir();
  }

  // ---------- 私有方法 ----------

  /** 将未知错误归一化为 Error 实例 */
  private _normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }

  /**
   * 创建 Bottleneck IORedisConnection 实例
   *
   * 将 Bottleneck.IORedisConnection 构造与类型断言集中在此处，
   * 避免在多处重复 `as unknown as` 断言。
   */
  private _createConnection(): IBottleneckConnection {
    const BottleneckRef = Bottleneck as unknown as Record<string, unknown>;
    const ConnectionCtor = BottleneckRef['IORedisConnection'] as new (
      opts: Record<string, unknown>,
    ) => IBottleneckConnection;
    return new ConnectionCtor({
      clientOptions: {
        host: this._redisConfig!.host,
        port: this._redisConfig!.port,
        password: this._redisConfig!.password,
        db: this._redisConfig!.db,
      },
    });
  }

  /**
   * 解析 IORedisConnection / Bottleneck 的 ready 属性
   * ready 可能是 Promise 或返回 Promise 的方法，需兼容处理
   */
  private async _resolveReady(target: { ready: unknown }): Promise<void> {
    const readyValue = target.ready;
    if (typeof readyValue === 'function') {
      const fn = readyValue as (this: typeof target) => Promise<unknown>;
      await fn.call(target);
      return;
    }
    await (readyValue as Promise<unknown>);
  }

  /**
   * Redis 模式下等待限流器就绪（内存模式直接返回）
   */
  private async _waitForLimiterReady(
    limiter: IBottleneckLimiter,
    key: string,
  ): Promise<void> {
    if (this._mode !== 'redis') {
      return;
    }
    try {
      await limiter.ready;
    } catch (error: unknown) {
      this._logger.error(
        {
          error: this._normalizeError(error),
          event: 'limiter_ready_failed',
          key,
        },
        `限流器初始化失败: ${key}`,
      );
      throw error;
    }
  }

  /** 断开所有限流器实例的连接 */
  private async _disconnectAllLimiters(): Promise<void> {
    for (const [key, limiter] of this._limiters.entries()) {
      try {
        await limiter.disconnect();
        this._logger.debug(
          { event: 'limiter_disconnected', key },
          `限流器已断开连接: ${key}`,
        );
      } catch (error: unknown) {
        this._logger.warn(
          {
            error: this._normalizeError(error),
            event: 'limiter_disconnect_error',
            key,
          },
          `断开限流器连接时发生错误: ${key}`,
        );
      }
    }
  }

  /** 关闭 Bottleneck IORedisConnection */
  private async _closeConnection(): Promise<void> {
    if (!this._bottleneckConnection) {
      return;
    }
    try {
      await this._bottleneckConnection.disconnect(false);
      this._bottleneckConnection = null;
      this._logger.info(
        { event: 'bottleneck_connection_closed' },
        'Bottleneck Connection 已关闭',
      );
    } catch (error: unknown) {
      this._logger.warn(
        {
          error: this._normalizeError(error),
          event: 'bottleneck_connection_close_warn',
        },
        '关闭 Bottleneck Connection 时发生错误，可能已关闭',
      );
      this._bottleneckConnection = null;
    }
  }

  /** 构建 Redis key（有 keyPrefix 时拼接前缀） */
  private _buildRedisKey(key: string): string {
    if (this._keyPrefix) {
      const prefix = this._keyPrefix.replace(/:$/, '');
      return `${prefix}:${key}`;
    }
    return key;
  }

  /** 为限流器绑定事件监听 */
  private _setupLimiterEvents(limiter: IBottleneckLimiter, key: string): void {
    limiter.on('error', (error) => {
      const normalizedError = this._normalizeError(error);
      if (this._isInfoCommandError(error)) {
        this._logger.debug(
          { error: normalizedError, event: 'limiter_info_error', key },
          `限流器 info 命令错误（可能是初始化过程中的正常错误）: ${key}`,
        );
      } else {
        this._logger.error(
          { error: normalizedError, event: 'limiter_error', key },
          `限流器发生错误: ${key}`,
        );
      }
    });
    limiter.on('depleted', () => {
      this._logger.debug(
        { event: 'limiter_depleted', key },
        `限流器令牌桶已耗尽: ${key}`,
      );
    });
    limiter.on('empty', () => {
      this._logger.debug(
        { event: 'limiter_empty', key },
        `限流器队列已清空: ${key}`,
      );
    });
  }

  /** 判断是否为 Redis INFO 命令相关的错误（初始化时可能产生的正常错误） */
  private _isInfoCommandError(error: unknown): boolean {
    if (error instanceof Error && /\binfo\b/i.test(error.message)) {
      return true;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'command' in error &&
      typeof (error as Record<string, unknown>)['command'] === 'object'
    ) {
      const command = (error as Record<string, Record<string, unknown>>)[
        'command'
      ];
      return command?.['name'] === 'info';
    }
    return false;
  }
}
