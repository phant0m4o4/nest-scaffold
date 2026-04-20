import redisConfig from '@/configs/redis.config';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisService } from './redis.service';

/**
 * 共享 Redis 模块（全局）
 *
 * 基于 ioredis 的全应用单例 Redis 客户端封装：
 * - 通过 `RedisService.getClient()` 暴露底层 `Redis | Cluster` 实例
 * - 自动处理连接（onModuleInit + ping 健康检查）与断开（onModuleDestroy）
 * - 复用 `@/configs/redis.config` 支持 single / sentinel / cluster 三种连接方式
 *
 * 使用方式：在 `AppModule` 中 `imports: [RedisModule]`，其他模块直接注入
 * `RedisService` 即可（已标记 @Global）。
 *
 * 注意：为确保进程接收到 SIGTERM/SIGINT 时能优雅关闭 Redis 连接，
 * 需要在 `main.ts` 中调用 `app.enableShutdownHooks()`。
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(redisConfig)],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
