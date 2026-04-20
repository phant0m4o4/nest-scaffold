import { normalizeError } from '@/common/utils/normalize-error';
import type { RedisConfigType } from '@/configs/redis.config';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { closeRedisClient, createRedisClient } from './redis.factory';
import type { RedisClient } from './redis.types';

/** PING 命令期望的响应值 */
const EXPECTED_PING_REPLY = 'PONG';

/**
 * 共享 Redis 服务
 *
 * 全应用唯一的 ioredis 客户端封装，职责：
 * - 在 `onModuleInit` 阶段读取配置、创建 Redis/Cluster 实例并执行健康检查
 * - 通过 `getClient()` 暴露底层客户端供业务直接调用 Redis 命令
 * - 在 `onModuleDestroy` 阶段优雅关闭连接（quit 或 disconnect）
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private _client: RedisClient | null = null;

  constructor(
    private readonly _configService: ConfigService,
    @InjectPinoLogger(RedisService.name)
    private readonly _logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisConfig =
      this._configService.getOrThrow<RedisConfigType>('redis');
    this._client = createRedisClient({
      config: redisConfig,
      logger: this._logger,
    });
    try {
      const reply = await this._client.ping();
      if (reply !== EXPECTED_PING_REPLY) {
        throw new Error(`Redis PING 响应异常: ${String(reply)}`);
      }
      this._logger.info('Redis 健康检查通过');
    } catch (error: unknown) {
      this._logger.error(
        { event: 'redis_ping_failed', error: normalizeError(error) },
        'Redis 健康检查失败',
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this._client) {
      return;
    }
    await closeRedisClient({ client: this._client, logger: this._logger });
    this._client = null;
  }

  /**
   * 获取底层 ioredis 客户端实例
   *
   * 仅在模块初始化完成后可用；在 `onModuleInit` 之前或 `onModuleDestroy` 之后
   * 调用都会抛出异常，避免业务拿到无效引用。
   *
   * @returns Redis | Cluster 实例
   */
  public getClient(): RedisClient {
    if (!this._client) {
      throw new Error('Redis 客户端尚未初始化或已被销毁');
    }
    return this._client;
  }
}
