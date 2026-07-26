import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { resolveRedisConnection } from '@/common/utils/redis/redis-connection';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 分布式锁配置（自包含）
 *
 * 锁只读取自己的 `DISTRIBUTED_LOCK_*` 环境变量，自建独立 Redis 连接，
 * 必填连接项缺失会直接启动报错，不会回退读取其他模块的配置。
 * Redlock 算法参数（重试、漂移、续期、TTL 等）由调用方在 `using()` 时按需设置。
 *
 * ⚠️ 生产部署：锁不得与缓存等可随时清空的数据共用同一个 Redis DB（缓存的
 * 内存淘汰策略 / FLUSHDB 会静默清掉锁键，互斥性失效）；cluster 模式无 DB
 * 概念，需独立实例。详见 `src/common/modules/distributed-lock/README.md`。
 *
 * .env 示例（`${REDIS_HOST}` 等为 .env 内的公共锚点变量，见 .env.example）：
 * DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock
 * DISTRIBUTED_LOCK_REDIS_HOST=${REDIS_HOST}
 * DISTRIBUTED_LOCK_REDIS_PORT=${REDIS_PORT}
 * DISTRIBUTED_LOCK_REDIS_PASSWORD=${REDIS_PASSWORD}
 * DISTRIBUTED_LOCK_REDIS_DB=0
 */
const environmentSchema = z.object({
  DISTRIBUTED_LOCK_KEY_PREFIX: z.string().optional(),
  DISTRIBUTED_LOCK_REDIS_MODE: z
    .enum(['single', 'sentinel', 'cluster'])
    .optional(),
  DISTRIBUTED_LOCK_REDIS_HOST: z.string().min(1).optional(),
  DISTRIBUTED_LOCK_REDIS_PORT: z.coerce.number().int().optional(),
  DISTRIBUTED_LOCK_REDIS_PASSWORD: z.string().optional(),
  DISTRIBUTED_LOCK_REDIS_DB: z.coerce.number().int().min(0).optional(),
  DISTRIBUTED_LOCK_REDIS_SENTINEL_MASTER_NAME: z.string().min(1).optional(),
  DISTRIBUTED_LOCK_REDIS_SENTINELS: z.string().min(1).optional(),
  DISTRIBUTED_LOCK_REDIS_CLUSTER_NODES: z.string().min(1).optional(),
});

const distributedLockConfig = registerEnvAsConfig(
  'distributedLock',
  environmentSchema,
  (env) => ({
    keyPrefix: env.DISTRIBUTED_LOCK_KEY_PREFIX ?? 'distributed-lock',
    connection: resolveRedisConnection({
      envPrefix: 'DISTRIBUTED_LOCK_REDIS',
      mode: env.DISTRIBUTED_LOCK_REDIS_MODE,
      host: env.DISTRIBUTED_LOCK_REDIS_HOST,
      port: env.DISTRIBUTED_LOCK_REDIS_PORT,
      password: env.DISTRIBUTED_LOCK_REDIS_PASSWORD,
      db: env.DISTRIBUTED_LOCK_REDIS_DB,
      sentinelMasterName: env.DISTRIBUTED_LOCK_REDIS_SENTINEL_MASTER_NAME,
      sentinels: env.DISTRIBUTED_LOCK_REDIS_SENTINELS,
      clusterNodes: env.DISTRIBUTED_LOCK_REDIS_CLUSTER_NODES,
    }),
  }),
);

export default distributedLockConfig;
export type DistributedLockConfigType = ConfigType<
  typeof distributedLockConfig
>;
