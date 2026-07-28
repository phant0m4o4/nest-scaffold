import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { resolveRedisConnection } from '@/common/utils/redis/redis-connection';
import { optionalEnvInt } from '@/common/utils/zod/optional-env-int';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 缓存配置（自包含）
 *
 * 缓存只读取自己的 `CACHE_*` 环境变量，自建独立 Redis 连接，
 * 必填连接项缺失会直接启动报错，不会回退读取其他模块的配置。
 * 缓存可随时清空/被淘汰，**禁止**与锁、队列等不可丢数据的服务共用一个 DB；
 * cluster 模式无 DB 概念，隔离需部署独立集群。
 *
 * .env 示例（`${REDIS_HOST}` 等为 .env 内的公共锚点变量，见 .env.example）：
 * CACHE_TTL_SECONDS=604800
 * CACHE_KEY_PREFIX=cache
 * CACHE_REDIS_HOST=${REDIS_HOST}
 * CACHE_REDIS_PORT=${REDIS_PORT}
 * CACHE_REDIS_PASSWORD=${REDIS_PASSWORD}
 * CACHE_REDIS_DB=0
 */
const environmentSchema = z.object({
  CACHE_TTL_SECONDS: optionalEnvInt(1),
  CACHE_KEY_PREFIX: z.string().optional(),
  CACHE_REDIS_MODE: z.enum(['single', 'sentinel', 'cluster']).optional(),
  CACHE_REDIS_HOST: z.string().min(1).optional(),
  CACHE_REDIS_PORT: optionalEnvInt(1),
  CACHE_REDIS_PASSWORD: z.string().optional(),
  CACHE_REDIS_DB: optionalEnvInt(0),
  CACHE_REDIS_SENTINEL_MASTER_NAME: z.string().min(1).optional(),
  CACHE_REDIS_SENTINELS: z.string().min(1).optional(),
  CACHE_REDIS_CLUSTER_NODES: z.string().min(1).optional(),
});

const cacheConfig = registerEnvAsConfig('cache', environmentSchema, (env) => {
  return {
    ttlSeconds: env.CACHE_TTL_SECONDS ?? 604800, // 7 days
    keyPrefix: env.CACHE_KEY_PREFIX ?? 'cache',
    connection: resolveRedisConnection({
      envPrefix: 'CACHE_REDIS',
      mode: env.CACHE_REDIS_MODE,
      host: env.CACHE_REDIS_HOST,
      port: env.CACHE_REDIS_PORT,
      password: env.CACHE_REDIS_PASSWORD,
      db: env.CACHE_REDIS_DB,
      sentinelMasterName: env.CACHE_REDIS_SENTINEL_MASTER_NAME,
      sentinels: env.CACHE_REDIS_SENTINELS,
      clusterNodes: env.CACHE_REDIS_CLUSTER_NODES,
    }),
  };
});
export default cacheConfig;
export type CacheConfigType = ConfigType<typeof cacheConfig>;
