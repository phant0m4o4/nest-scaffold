import cacheConfig from '@/configs/cache.config';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';

/**
 * 缓存模块
 *
 * 基于 Redis 的缓存模块，提供 `CacheService` 进行缓存读写操作。
 *
 * 使用方式：
 * - 在 `AppModule` 中以 `CacheModule.forRoot({ isGlobal: true })` 注册为全局模块
 * - 其他模块直接注入 `CacheService` 即可使用，无需重复 import
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Module({
  imports: [ConfigModule.forFeature(cacheConfig)],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {
  /**
   * 注册缓存模块
   * @param options.isGlobal 是否注册为全局模块（推荐 true）
   */
  static forRoot(options: { isGlobal?: boolean } = {}): DynamicModule {
    const { isGlobal } = options;
    return {
      module: CacheModule,
      global: isGlobal ?? false,
    };
  }
}
