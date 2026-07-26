import cacheConfig from '@/configs/cache.config';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';

/**
 * 缓存模块（全局）
 *
 * 基于 Redis 的缓存模块，提供 `CacheService` 进行缓存读写操作。
 *
 * 使用方式：
 * - 在 `AppModule` 中导入 `CacheModule` 即可（已标记 @Global）
 * - 其他模块直接注入 `CacheService` 即可使用，无需重复 import
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(cacheConfig)],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
