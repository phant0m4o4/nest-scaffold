import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 队列配置（BullMQ）
 *
 * BullMQ 的 worker 会使用 blocking / subscribe 等专用连接，必须独享 Redis 连接，
 * 因此队列的 Redis 连接参数在这里独立声明，与其他模块的 Redis 连接隔离。
 *
 * 如果希望复用全局 Redis 的地址/端口/密码，可以在 `.env` 中直接引用变量，例如：
 *   QUEUE_REDIS_HOST=${REDIS_HOST}
 *   QUEUE_REDIS_PORT=${REDIS_PORT}
 *   QUEUE_REDIS_PASSWORD=${REDIS_PASSWORD}
 *   QUEUE_REDIS_DB=2  # 建议用独立 DB 或 keyPrefix 与业务数据隔离
 *
 * .env 示例：
 * QUEUE_REDIS_HOST=127.0.0.1
 * QUEUE_REDIS_PORT=6379
 * QUEUE_REDIS_PASSWORD=
 * QUEUE_REDIS_DB=0
 * QUEUE_KEY_PREFIX=queue
 * QUEUE_DASHBOARD_ROUTE=/queues
 */
const environmentSchema = z.object({
  QUEUE_REDIS_HOST: z.string().optional(),
  QUEUE_REDIS_PORT: z.coerce.number().int().optional(),
  QUEUE_REDIS_PASSWORD: z.string().optional(),
  QUEUE_REDIS_DB: z.coerce.number().int().optional(),
  QUEUE_KEY_PREFIX: z.string().optional(),
  QUEUE_DASHBOARD_ROUTE: z.string().optional(),
});

const queueConfig = registerEnvAsConfig('queue', environmentSchema, (env) => {
  return {
    keyPrefix: env.QUEUE_KEY_PREFIX ?? 'queue',
    dashboardRoute: env.QUEUE_DASHBOARD_ROUTE ?? '/queues',
    redis: {
      host: env.QUEUE_REDIS_HOST ?? '127.0.0.1',
      port: env.QUEUE_REDIS_PORT ?? 6379,
      password: env.QUEUE_REDIS_PASSWORD ?? undefined,
      db: env.QUEUE_REDIS_DB ?? 0,
      // BullMQ worker 走 blocking 命令，必须关闭重试上限
      maxRetriesPerRequest: null,
    },
  };
});
export default queueConfig;
export type QueueConfigType = ConfigType<typeof queueConfig>;
