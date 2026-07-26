import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 缓存配置
 *
 * 缓存使用独立的 Redis 连接与独立 DB（复用 `RedisModule` 的地址/密码配置，
 * 仅 DB 编号不同）。缓存可随时清空/被淘汰，**禁止**与锁、队列等不可丢数据的
 * 服务共用一个 DB；cluster 模式无 DB 概念，隔离需部署独立集群。
 *
 * .env 示例：
 * CACHE_TTL_SECONDS=604800
 * CACHE_KEY_PREFIX=cache
 * CACHE_REDIS_DB=1
 */
const environmentSchema = z.object({
  CACHE_TTL_SECONDS: z.coerce.number().int().optional(),
  CACHE_KEY_PREFIX: z.string().optional(),
  CACHE_REDIS_DB: z.coerce.number().int().min(0).optional(),
});

const cacheConfig = registerEnvAsConfig('cache', environmentSchema, (env) => {
  return {
    ttlSeconds: env.CACHE_TTL_SECONDS ?? 604800, // 7 days
    keyPrefix: env.CACHE_KEY_PREFIX ?? 'cache',
    redisDb: env.CACHE_REDIS_DB ?? 1,
  };
});
export default cacheConfig;
export type CacheConfigType = ConfigType<typeof cacheConfig>;
