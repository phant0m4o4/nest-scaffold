import {
  closeRedisClient,
  createRedisClient,
} from '@/common/utils/redis/redis.factory';
import type { RedisClient } from '@/common/utils/redis/redis.types';
import { normalizeError } from '@/common/utils/normalize-error';
import { CacheConfigType } from '@/configs/cache.config';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/**
 * 批量操作结果类型
 */
interface IBatchResult<T> {
  key: string;
  value: T | null;
  success: boolean;
}

/**
 * 缓存服务
 *
 * 基于独立 Redis 连接的缓存封装，支持：
 * - JSON 序列化/反序列化（支持所有 JSON 可序列化类型）
 * - TTL 管理（秒级，-1 表示永不过期）
 * - 键前缀管理（自动添加 `{keyPrefix}:` 前缀）
 * - 批量读写、删除、存在性检查
 * - 原子递增/递减
 * - 原始字符串操作
 * - Lua 脚本执行
 *
 * 缓存持有自己的连接与独立 DB（只读取 `CACHE_*` 自己的配置，连接项缺失
 * 直接启动报错）：缓存可随时清空/被淘汰，禁止与锁、队列等不可丢数据的
 * 服务共用一个 DB。cluster 模式无 DB 概念，隔离需部署独立集群。
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  /** 键名最大长度限制 */
  private static readonly _MAX_KEY_LENGTH = 250;

  private _redis!: RedisClient;
  private readonly _defaultTtlSeconds: number;
  private readonly _keyPrefix: string;
  private readonly _connection: CacheConfigType['connection'];

  constructor(
    private readonly _configService: ConfigService,
    @InjectPinoLogger(CacheService.name) private readonly _logger: PinoLogger,
  ) {
    const cacheConfig =
      this._configService.getOrThrow<CacheConfigType>('cache');
    this._defaultTtlSeconds = cacheConfig.ttlSeconds;
    this._keyPrefix = cacheConfig.keyPrefix;
    this._connection = cacheConfig.connection;
  }

  async onModuleInit(): Promise<void> {
    if (this._connection.mode === 'cluster') {
      this._logger.warn(
        { event: 'cache_cluster_no_db_isolation' },
        'cluster 模式无 DB 概念，缓存无法通过 DB 与其他服务隔离，生产环境请为缓存部署独立集群',
      );
    }
    this._redis = createRedisClient({
      config: this._connection,
      logger: this._logger,
    });
    try {
      const reply = await this._redis.ping();
      if (reply !== 'PONG') {
        throw new Error(`缓存 Redis PING 响应异常: ${String(reply)}`);
      }
    } catch (error: unknown) {
      this._logger.error(
        { event: 'cache_redis_ping_failed', error: normalizeError(error) },
        '缓存 Redis 健康检查失败',
      );
      throw error;
    }
    this._logger.info(
      { event: 'cache_ready', db: this._resolveDbLabel() },
      '缓存服务初始化完成（独立 Redis 连接）',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (!this._redis) {
      return;
    }
    await closeRedisClient({ client: this._redis, logger: this._logger });
  }

  /**
   * 取当前连接的 DB 编号用于日志（cluster 模式无 DB 概念，返回 undefined）
   * @private
   */
  private _resolveDbLabel(): number | undefined {
    if (this._connection.mode === 'single') {
      return this._connection.single.db;
    }
    if (this._connection.mode === 'sentinel') {
      return this._connection.sentinel.db;
    }
    return undefined;
  }

  /**
   * 验证键名基本格式
   * @private
   */
  private _validateKeyFormat(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('缓存键名必须是非空字符串');
    }
    if (key.includes('\n') || key.includes('\r')) {
      throw new Error('缓存键名不能包含换行符');
    }
  }

  /**
   * 获取带前缀的完整键名
   * @private
   */
  private _buildFullKey(key: string): string {
    this._validateKeyFormat(key);
    const fullKey = `${this._keyPrefix}:${key}`;
    if (fullKey.length > CacheService._MAX_KEY_LENGTH) {
      throw new Error(
        `完整缓存键名长度不能超过 ${CacheService._MAX_KEY_LENGTH} 个字符，当前长度: ${fullKey.length}`,
      );
    }
    return fullKey;
  }

  /**
   * 序列化值为 JSON 字符串
   * @private
   */
  private _serialize<T>(value: T): string {
    return JSON.stringify(value);
  }

  /**
   * 反序列化 JSON 字符串
   * @private
   */
  private _deserialize<T>(json: string): T {
    return JSON.parse(json) as T;
  }

  /**
   * 从 Redis 获取原始字符串值
   * @private
   */
  private async _getRawValue(key: string): Promise<string | null> {
    return await this._redis.get(this._buildFullKey(key));
  }

  /**
   * 设置原始字符串值到 Redis
   * @private
   */
  private async _setRawValue(
    key: string,
    value: string,
    ttlSeconds: number = this._defaultTtlSeconds,
  ): Promise<void> {
    if (ttlSeconds === 0) {
      throw new Error('缓存 TTL 时间不能为 0');
    }
    const fullKey = this._buildFullKey(key);
    const result =
      ttlSeconds < 0
        ? await this._redis.set(fullKey, value)
        : await this._redis.setex(fullKey, ttlSeconds, value);
    if (result !== 'OK') {
      throw new Error(`缓存设置失败: ${fullKey}`);
    }
  }

  /**
   * 获取缓存值
   * @param key 缓存键名
   * @returns 反序列化的值或 null
   */
  public async get<T = unknown>(key: string): Promise<T | null> {
    const rawValue = await this._getRawValue(key);
    if (!rawValue) {
      return null;
    }
    return this._deserialize<T>(rawValue);
  }

  /**
   * 设置缓存值
   * @param key 缓存键名
   * @param value 要缓存的值
   * @param ttlSeconds TTL 时间（秒），-1 表示永不过期
   */
  public async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = this._defaultTtlSeconds,
  ): Promise<void> {
    const serializedValue = this._serialize(value);
    await this._setRawValue(key, serializedValue, ttlSeconds);
  }

  /**
   * 获取原始字符串值
   * @param key 缓存键名
   * @returns 原始字符串值或 null
   */
  public async getRaw(key: string): Promise<string | null> {
    return await this._getRawValue(key);
  }

  /**
   * 设置原始字符串值
   * @param key 缓存键名
   * @param value 原始字符串值
   * @param ttlSeconds TTL 时间（秒），-1 表示永不过期
   */
  public async setRaw(
    key: string,
    value: string,
    ttlSeconds: number = this._defaultTtlSeconds,
  ): Promise<void> {
    await this._setRawValue(key, value, ttlSeconds);
  }

  /**
   * 批量获取缓存值
   * @param keys 缓存键名数组
   * @returns 批量操作结果数组
   */
  public async getBatch<T = unknown>(
    keys: string[],
  ): Promise<IBatchResult<T>[]> {
    if (keys.length === 0) {
      return [];
    }
    const fullKeys = keys.map((key) => this._buildFullKey(key));
    const rawValues = await this._redis.mget(...fullKeys);
    return keys.map((key, index) => {
      const rawValue = rawValues[index];
      try {
        const value = rawValue ? this._deserialize<T>(rawValue) : null;
        return { key, value, success: true };
      } catch {
        return { key, value: null, success: false };
      }
    });
  }

  /**
   * 批量设置缓存值（使用 Redis Pipeline 提升性能）
   * @param items 要设置的键值对数组
   * @param ttlSeconds TTL 时间（秒），-1 表示永不过期
   * @returns 设置成功的键数量
   */
  public async setBatch<T>(
    items: Array<{ key: string; value: T }>,
    ttlSeconds: number = this._defaultTtlSeconds,
  ): Promise<number> {
    if (items.length === 0) {
      return 0;
    }
    if (ttlSeconds === 0) {
      throw new Error('缓存 TTL 时间不能为 0');
    }
    const pipeline = this._redis.pipeline();
    for (const item of items) {
      const fullKey = this._buildFullKey(item.key);
      const serializedValue = this._serialize(item.value);
      if (ttlSeconds < 0) {
        pipeline.set(fullKey, serializedValue);
      } else {
        pipeline.setex(fullKey, ttlSeconds, serializedValue);
      }
    }
    const results = await pipeline.exec();
    if (!results) {
      return 0;
    }
    return results.filter(([err]) => err === null).length;
  }

  /**
   * 删除缓存值
   * @param key 缓存键名
   * @returns 是否删除成功
   */
  public async delete(key: string): Promise<boolean> {
    const fullKey = this._buildFullKey(key);
    const deletedCount = await this._redis.del(fullKey);
    return deletedCount > 0;
  }

  /**
   * 批量删除缓存值
   * @param keys 缓存键名数组
   * @returns 删除成功的键数量
   */
  public async deleteBatch(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    const fullKeys = keys.map((key) => this._buildFullKey(key));
    return await this._redis.del(...fullKeys);
  }

  /**
   * 检查键是否存在
   * @param key 缓存键名
   * @returns 键是否存在
   */
  public async exists(key: string): Promise<boolean> {
    const fullKey = this._buildFullKey(key);
    const existsCount = await this._redis.exists(fullKey);
    return existsCount === 1;
  }

  /**
   * 批量检查键是否存在
   * @param keys 缓存键名数组
   * @returns 存在的键数量
   */
  public async existsBatch(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    const fullKeys = keys.map((key) => this._buildFullKey(key));
    return await this._redis.exists(...fullKeys);
  }

  /**
   * 获取键的 TTL（剩余生存时间）
   * @param key 缓存键名
   * @returns TTL 秒数，-1 表示永不过期，-2 表示键不存在
   */
  public async getTTL(key: string): Promise<number> {
    const fullKey = this._buildFullKey(key);
    return await this._redis.ttl(fullKey);
  }

  /**
   * 设置键的过期时间
   * @param key 缓存键名
   * @param ttlSeconds TTL 时间（秒）
   * @returns 是否设置成功
   */
  public async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (ttlSeconds <= 0) {
      throw new Error('TTL 时间必须大于 0');
    }
    const fullKey = this._buildFullKey(key);
    const result = await this._redis.expire(fullKey, ttlSeconds);
    return result === 1;
  }

  /**
   * 移除键的过期时间（设置为永不过期）
   * @param key 缓存键名
   * @returns 是否操作成功
   */
  public async persist(key: string): Promise<boolean> {
    const fullKey = this._buildFullKey(key);
    const result = await this._redis.persist(fullKey);
    return result === 1;
  }

  /**
   * 重命名键
   * @param oldKey 旧键名
   * @param newKey 新键名
   * @returns 是否重命名成功
   */
  public async rename(oldKey: string, newKey: string): Promise<boolean> {
    const oldFullKey = this._buildFullKey(oldKey);
    const newFullKey = this._buildFullKey(newKey);
    try {
      await this._redis.rename(oldFullKey, newFullKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清空缓存专用 DB 中的所有数据（FLUSHDB，不影响其他 DB）
   */
  public async flush(): Promise<void> {
    const result = await this._redis.flushdb();
    if (result !== 'OK') {
      throw new Error('缓存清空失败');
    }
  }

  /**
   * 递增数值
   * @param key 缓存键名
   * @param step 递增步长，默认为 1
   * @returns 递增后的值
   */
  public async increment(key: string, step: number = 1): Promise<number> {
    const fullKey = this._buildFullKey(key);
    return step === 1
      ? await this._redis.incr(fullKey)
      : await this._redis.incrby(fullKey, step);
  }

  /**
   * 递减数值
   * @param key 缓存键名
   * @param step 递减步长，默认为 1
   * @returns 递减后的值
   */
  public async decrement(key: string, step: number = 1): Promise<number> {
    const fullKey = this._buildFullKey(key);
    return step === 1
      ? await this._redis.decr(fullKey)
      : await this._redis.decrby(fullKey, step);
  }

  /**
   * 执行 Lua 脚本
   * @param script Lua 脚本内容
   * @param keys 键名数组
   * @param args 参数数组
   * @returns 脚本执行结果
   */
  public async executeScript(
    script: string,
    keys: string[] = [],
    args: (string | number)[] = [],
  ): Promise<unknown> {
    const fullKeys = keys.map((key) => this._buildFullKey(key));
    const numKeys = fullKeys.length;
    return await this._redis.eval(script, numKeys, ...fullKeys, ...args);
  }

  /**
   * 获取 Redis 连接状态
   * @returns 连接状态
   */
  public getConnectionStatus(): string {
    return this._redis.status;
  }

  /**
   * 检查 Redis 连接健康状态
   * @returns 是否连接健康
   */
  public async isHealthy(): Promise<boolean> {
    try {
      const result = await this._redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
