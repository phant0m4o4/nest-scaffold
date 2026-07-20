import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 缓存配置
 *
 * Redis 连接由 `RedisModule` 统一管理，此处仅保留缓存本身的 TTL 与键前缀。
 *
 * .env 示例：
 * CACHE_TTL_SECONDS=604800
 * CACHE_KEY_PREFIX=cache
 */
const environmentSchema = z.object({
  CACHE_TTL_SECONDS: z.coerce.number().int().optional(),
  CACHE_KEY_PREFIX: z.string().optional(),
});

const cacheConfig = registerEnvAsConfig('cache', environmentSchema, (env) => {
  return {
    ttlSeconds: env.CACHE_TTL_SECONDS ?? 604800, // 7 days
    keyPrefix: env.CACHE_KEY_PREFIX ?? 'cache',
  };
});
export default cacheConfig;
export type CacheConfigType = ConfigType<typeof cacheConfig>;
