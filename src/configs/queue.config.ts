import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 队列配置（BullMQ / Redis）
 *
 * .env 示例：
 * QUEUE_REDIS_HOST=127.0.0.1
 * QUEUE_REDIS_PORT=6379
 * QUEUE_REDIS_PASSWORD=
 * QUEUE_REDIS_DB=2
 * QUEUE_REDIS_PREFIX=queue
 * QUEUE_DASHBOARD_ROUTE=/queues
 */
class EnvironmentVariables {
  @Expose()
  @IsString()
  @IsOptional()
  QUEUE_REDIS_HOST?: string;

  @Expose()
  @IsInt()
  @IsOptional()
  QUEUE_REDIS_PORT?: number;

  @Expose()
  @IsString()
  @IsOptional()
  QUEUE_REDIS_PASSWORD?: string;

  @Expose()
  @IsInt()
  @IsOptional()
  QUEUE_REDIS_DB?: number;

  @Expose()
  @IsString()
  @IsOptional()
  QUEUE_REDIS_PREFIX?: string;

  @Expose()
  @IsString()
  @IsOptional()
  QUEUE_DASHBOARD_ROUTE?: string;
}

const queueConfig = registerEnvAsConfig(
  'queue',
  EnvironmentVariables,
  (env) => {
    return {
      keyPrefix: env.QUEUE_REDIS_PREFIX ?? 'queue',
      dashboardRoute: env.QUEUE_DASHBOARD_ROUTE ?? '/queues',
      redis: {
        host: env.QUEUE_REDIS_HOST ?? '127.0.0.1',
        port: env.QUEUE_REDIS_PORT ?? 6379,
        password: env.QUEUE_REDIS_PASSWORD ?? undefined,
        db: env.QUEUE_REDIS_DB ?? 0, // 使用不同的数据库避免冲突
      },
    };
  },
);
export default queueConfig;
export type QueueConfigType = ConfigType<typeof queueConfig>;
