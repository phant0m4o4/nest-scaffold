import { RedisService } from '@/common/modules/redis/redis.service';
import type { RedisClient } from '@/common/modules/redis/redis.types';
import { CacheConfigType } from '@/configs/cache.config';
import { Injectable, OnModuleInit } from '@nestjs/common';
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
 * 基于共享 `RedisService` 的缓存封装，支持：
 * - JSON 序列化/反序列化（支持所有 JSON 可序列化类型）
 * - TTL 管理（秒级，-1 表示永不过期）
 * - 键前缀管理（自动添加 `{keyPrefix}:` 前缀）
 * - 批量读写、删除、存在性检查
 * - 原子递增/递减
 * - 原始字符串操作
 * - Lua 脚本执行
 *
 * Redis 连接的创建与生命周期由 `RedisService` 统一负责，本服务不再自建连接。
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Injectable()
export class CacheService implements OnModuleInit {
  /** 键名最大长度限制 */
  private static readonly _MAX_KEY_LENGTH = 250;

  private _redis!: RedisClient;
  private readonly _defaultTtlSeconds: number;
  private readonly _keyPrefix: string;

  constructor(
    private readonly _configService: ConfigService,
    private readonly _redisService: RedisService,
    @InjectPinoLogger(CacheService.name) private readonly _logger: PinoLogger,
  ) {
    const cacheConfig =
      this._configService.getOrThrow<CacheConfigType>('cache');
    this._defaultTtlSeconds = cacheConfig.ttlSeconds;
    this._keyPrefix = cacheConfig.keyPrefix;
  }

  onModuleInit(): void {
    // RedisService 已在自身的 onModuleInit 完成连接与健康检查，
    // 此处仅需要取回共享 client 引用即可
    this._redis = this._redisService.getClient();
    this._logger.info('缓存服务初始化完成');
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
   * 清空所有缓存
   */
  public async flush(): Promise<void> {
    const result = await this._redis.flushall();
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
