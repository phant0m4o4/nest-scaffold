import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { resolveRedisConnection } from '@/common/utils/redis/redis-connection';
import { optionalEnvInt } from '@/common/utils/zod/optional-env-int';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 队列配置（BullMQ，自包含）
 *
 * BullMQ 的 worker 会使用 blocking / subscribe 等专用连接，必须独享 Redis 连接，
 * 因此队列的 Redis 连接参数在这里独立声明，与其他模块的 Redis 连接隔离。
 * 只读取 `QUEUE_*` 自己的环境变量，必填连接项缺失会直接启动报错，
 * 不会回退读取其他模块的配置。支持 single / sentinel / cluster 三种模式
 * （`QUEUE_REDIS_MODE`，默认 single）。
 *
 * .env 示例（`${REDIS_HOST}` 等为 .env 内的公共锚点变量，见 .env.example）：
 * QUEUE_REDIS_HOST=${REDIS_HOST}
 * QUEUE_REDIS_PORT=${REDIS_PORT}
 * QUEUE_REDIS_PASSWORD=${REDIS_PASSWORD}
 * QUEUE_REDIS_DB=2
 * QUEUE_KEY_PREFIX=queue
 * QUEUE_DASHBOARD_ROUTE=/queues
 */
const environmentSchema = z.object({
  QUEUE_REDIS_MODE: z.enum(['single', 'sentinel', 'cluster']).optional(),
  QUEUE_REDIS_HOST: z.string().min(1).optional(),
  QUEUE_REDIS_PORT: optionalEnvInt(1),
  QUEUE_REDIS_PASSWORD: z.string().optional(),
  QUEUE_REDIS_DB: optionalEnvInt(0),
  QUEUE_REDIS_SENTINEL_MASTER_NAME: z.string().min(1).optional(),
  QUEUE_REDIS_SENTINELS: z.string().min(1).optional(),
  QUEUE_REDIS_CLUSTER_NODES: z.string().min(1).optional(),
  QUEUE_KEY_PREFIX: z.string().optional(),
  QUEUE_DASHBOARD_ROUTE: z.string().optional(),
});

const queueConfig = registerEnvAsConfig('queue', environmentSchema, (env) => {
  return {
    keyPrefix: env.QUEUE_KEY_PREFIX ?? 'queue',
    dashboardRoute: env.QUEUE_DASHBOARD_ROUTE ?? '/queues',
    connection: resolveRedisConnection({
      envPrefix: 'QUEUE_REDIS',
      mode: env.QUEUE_REDIS_MODE,
      host: env.QUEUE_REDIS_HOST,
      port: env.QUEUE_REDIS_PORT,
      password: env.QUEUE_REDIS_PASSWORD,
      db: env.QUEUE_REDIS_DB,
      sentinelMasterName: env.QUEUE_REDIS_SENTINEL_MASTER_NAME,
      sentinels: env.QUEUE_REDIS_SENTINELS,
      clusterNodes: env.QUEUE_REDIS_CLUSTER_NODES,
    }),
  };
});
export default queueConfig;
export type QueueConfigType = ConfigType<typeof queueConfig>;
