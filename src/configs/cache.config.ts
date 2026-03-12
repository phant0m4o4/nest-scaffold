import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 缓存配置（基于 Redis）
 *
 * .env 示例：
 * CACHE_REDIS_HOST=127.0.0.1
 * CACHE_REDIS_PORT=6379
 * CACHE_REDIS_PASSWORD=
 * CACHE_REDIS_DB=0
 * CACHE_REDIS_TTL_SECONDS=604800
 * CACHE_REDIS_KEY_PREFIX=cache
 */
class EnvironmentVariables {
  @Expose()
  @IsString()
  @IsOptional()
  CACHE_REDIS_HOST?: string;

  @Expose()
  @IsInt()
  @IsOptional()
  CACHE_REDIS_PORT?: number;

  @Expose()
  @IsString()
  @IsOptional()
  CACHE_REDIS_PASSWORD?: string;

  @Expose()
  @IsInt()
  @IsOptional()
  CACHE_REDIS_DB?: number;

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
      redis: {
        host: env.CACHE_REDIS_HOST ?? '127.0.0.1',
        port: env.CACHE_REDIS_PORT ?? 6379,
        password: env.CACHE_REDIS_PASSWORD ?? undefined,
        db: env.CACHE_REDIS_DB ?? 0,
      },
    };
  },
);
export default cacheConfig;
export type CacheConfigType = ConfigType<typeof cacheConfig>;
