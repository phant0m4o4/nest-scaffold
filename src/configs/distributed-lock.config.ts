import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 分布式锁配置
 *
 * Redis 连接由 `RedisModule` 统一管理；Redlock 算法参数（重试、漂移、续期、TTL 等）
 * 由调用方在 `using()` 时按需设置。
 *
 * ⚠️ 生产部署：锁不得与缓存共用同一个 Redis DB（缓存的内存淘汰策略 / FLUSHDB
 * 会静默清掉锁键，互斥性失效），至少 DB 编号分开，建议分实例；
 * 详见 `src/common/modules/distributed-lock/README.md`「锁与缓存的 Redis 隔离」。
 *
 * .env 示例：
 * DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock
 */
const environmentSchema = z.object({
  DISTRIBUTED_LOCK_KEY_PREFIX: z.string().optional(),
});

const distributedLockConfig = registerEnvAsConfig(
  'distributedLock',
  environmentSchema,
  (env) => ({
    keyPrefix: env.DISTRIBUTED_LOCK_KEY_PREFIX ?? 'distributed-lock',
  }),
);

export default distributedLockConfig;
export type DistributedLockConfigType = ConfigType<
  typeof distributedLockConfig
>;
