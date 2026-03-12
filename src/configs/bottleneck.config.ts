import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Bottleneck 限流配置
 *
 * 基于 bottleneck 库的限流模块配置，支持内存模式和 Redis 分布式模式。
 *
 * .env 示例：
 * BOTTLENECK_MODE=redis
 * BOTTLENECK_REDIS_HOST=127.0.0.1
 * BOTTLENECK_REDIS_PORT=6379
 * BOTTLENECK_REDIS_PASSWORD=
 * BOTTLENECK_REDIS_DB=3
 * BOTTLENECK_REDIS_KEY_PREFIX=bottleneck
 */
class EnvironmentVariables {
  /**
   * 限流模式：'redis' 表示分布式限流（基于 Redis），'memory' 表示内存限流（单机）
   * 默认值: 'memory'
   */
  @Expose()
  @IsIn(['redis', 'memory'])
  @IsOptional()
  BOTTLENECK_MODE?: 'redis' | 'memory';

  /**
   * Redis 主机地址（仅在 redis 模式下使用）
   * 默认值: '127.0.0.1'
   */
  @Expose()
  @IsString()
  @IsOptional()
  @ValidateIf(
    (object: EnvironmentVariables) => object.BOTTLENECK_MODE === 'redis',
  )
  BOTTLENECK_REDIS_HOST?: string;

  /**
   * Redis 端口（仅在 redis 模式下使用）
   * 默认值: 6379
   */
  @Expose()
  @IsInt()
  @IsOptional()
  @ValidateIf(
    (object: EnvironmentVariables) => object.BOTTLENECK_MODE === 'redis',
  )
  BOTTLENECK_REDIS_PORT?: number;

  /**
   * Redis 密码（仅在 redis 模式下使用）
   * 默认值: undefined（无密码）
   */
  @Expose()
  @IsString()
  @IsOptional()
  @ValidateIf(
    (object: EnvironmentVariables) => object.BOTTLENECK_MODE === 'redis',
  )
  BOTTLENECK_REDIS_PASSWORD?: string;

  /**
   * Redis 数据库编号（仅在 redis 模式下使用）
   * 默认值: 0
   */
  @Expose()
  @IsInt()
  @IsOptional()
  @ValidateIf(
    (object: EnvironmentVariables) => object.BOTTLENECK_MODE === 'redis',
  )
  BOTTLENECK_REDIS_DB?: number;

  /**
   * Redis Key 前缀（仅在 redis 模式下使用）
   * 用于区分不同模块的 Redis key，避免冲突
   */
  @Expose()
  @IsString()
  @IsOptional()
  @ValidateIf(
    (object: EnvironmentVariables) => object.BOTTLENECK_MODE === 'redis',
  )
  BOTTLENECK_REDIS_KEY_PREFIX?: string;
}

const bottleneckConfig = registerEnvAsConfig(
  'bottleneck',
  EnvironmentVariables,
  (env) => {
    return {
      mode: env.BOTTLENECK_MODE ?? 'memory',
      keyPrefix: env.BOTTLENECK_REDIS_KEY_PREFIX ?? 'bottleneck',
      redis: {
        host: env.BOTTLENECK_REDIS_HOST ?? '127.0.0.1',
        port: env.BOTTLENECK_REDIS_PORT ?? 6379,
        password: env.BOTTLENECK_REDIS_PASSWORD ?? undefined,
        db: env.BOTTLENECK_REDIS_DB ?? 0,
      },
    };
  },
);

export default bottleneckConfig;
export type BottleneckConfigType = ConfigType<typeof bottleneckConfig>;
