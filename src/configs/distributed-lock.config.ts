import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

/**
 * 分布式锁配置
 *
 * Redis 连接由 `RedisModule` 统一管理；Redlock 算法参数（重试、漂移、续期、TTL 等）
 * 由调用方在 `using()` 时按需设置。
 *
 * .env 示例：
 * DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock
 */
class EnvironmentVariables {
  @Expose()
  @IsString()
  @IsOptional()
  DISTRIBUTED_LOCK_KEY_PREFIX?: string;
}

const distributedLockConfig = registerEnvAsConfig(
  'distributedLock',
  EnvironmentVariables,
  (env) => ({
    keyPrefix: env.DISTRIBUTED_LOCK_KEY_PREFIX ?? 'distributed-lock',
  }),
);

export default distributedLockConfig;
export type DistributedLockConfigType = ConfigType<
  typeof distributedLockConfig
>;
