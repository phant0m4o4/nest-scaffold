import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 分布式锁配置（仅 Redis 连接与键前缀）
 *
 * Redlock 算法参数（重试、漂移、续期、TTL 等）由调用方在 `using()` 时按需设置，
 * 服务内部提供合理的默认值，不通过环境变量暴露。
 *
 * .env 示例：
 * DISTRIBUTED_LOCK_REDIS_HOST=127.0.0.1
 * DISTRIBUTED_LOCK_REDIS_PORT=6379
 * DISTRIBUTED_LOCK_REDIS_PASSWORD=
 * DISTRIBUTED_LOCK_REDIS_DB=1
 * DISTRIBUTED_LOCK_KEY_PREFIX=lock
 */
class EnvironmentVariables {
  @Expose()
  @IsString()
  @IsOptional()
  DISTRIBUTED_LOCK_REDIS_HOST?: string;

  @Expose()
  @IsInt()
  @IsOptional()
  DISTRIBUTED_LOCK_REDIS_PORT?: number;

  @Expose()
  @IsString()
  @IsOptional()
  DISTRIBUTED_LOCK_REDIS_PASSWORD?: string;

  @Expose()
  @IsInt()
  @IsOptional()
  DISTRIBUTED_LOCK_REDIS_DB?: number;

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
    redis: {
      host: env.DISTRIBUTED_LOCK_REDIS_HOST ?? '127.0.0.1',
      port: env.DISTRIBUTED_LOCK_REDIS_PORT ?? 6379,
      password: env.DISTRIBUTED_LOCK_REDIS_PASSWORD ?? undefined,
      db: env.DISTRIBUTED_LOCK_REDIS_DB ?? 0,
    },
  }),
);

export default distributedLockConfig;
export type DistributedLockConfigType = ConfigType<
  typeof distributedLockConfig
>;
