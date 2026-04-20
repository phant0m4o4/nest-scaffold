import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 缓存配置
 *
 * Redis 连接由 `RedisModule` 统一管理，此处仅保留缓存本身的 TTL 与键前缀。
 *
 * .env 示例：
 * CACHE_TTL_SECONDS=604800
 * CACHE_KEY_PREFIX=cache
 */
class EnvironmentVariables {
  @Expose()
  @IsInt()
  @IsOptional()
  CACHE_TTL_SECONDS?: number;

  @Expose()
  @IsString()
  @IsOptional()
  CACHE_KEY_PREFIX?: string;
}

const cacheConfig = registerEnvAsConfig(
  'cache',
  EnvironmentVariables,
  (env) => {
    return {
      ttlSeconds: env.CACHE_TTL_SECONDS ?? 604800, // 7 days
      keyPrefix: env.CACHE_KEY_PREFIX ?? 'cache',
    };
  },
);
export default cacheConfig;
export type CacheConfigType = ConfigType<typeof cacheConfig>;
