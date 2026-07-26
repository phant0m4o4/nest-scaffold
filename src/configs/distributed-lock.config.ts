import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 分布式锁配置
 *
 * 锁使用独立的 Redis 连接与独立 DB（地址/密码复用 `REDIS_*` 基础配置，
 * 仅 DB 编号不同）；Redlock 算法参数（重试、漂移、续期、TTL 等）
 * 由调用方在 `using()` 时按需设置。
 *
 * ⚠️ 生产部署：锁不得与缓存等可随时清空的数据共用同一个 Redis DB（缓存的
 * 内存淘汰策略 / FLUSHDB 会静默清掉锁键，互斥性失效）；cluster 模式无 DB
 * 概念，需独立实例。详见 `src/common/modules/distributed-lock/README.md`。
 *
 * .env 示例：
 * DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock
 * DISTRIBUTED_LOCK_REDIS_DB=0
 */
const environmentSchema = z.object({
  DISTRIBUTED_LOCK_KEY_PREFIX: z.string().optional(),
  DISTRIBUTED_LOCK_REDIS_DB: z.coerce.number().int().min(0).optional(),
});

const distributedLockConfig = registerEnvAsConfig(
  'distributedLock',
  environmentSchema,
  (env) => ({
    keyPrefix: env.DISTRIBUTED_LOCK_KEY_PREFIX ?? 'distributed-lock',
    redisDb: env.DISTRIBUTED_LOCK_REDIS_DB ?? 0,
  }),
);

export default distributedLockConfig;
export type DistributedLockConfigType = ConfigType<
  typeof distributedLockConfig
>;
