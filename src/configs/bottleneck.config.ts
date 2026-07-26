import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { resolveRedisConnection } from '@/common/utils/redis/redis-connection';
import { optionalEnvInt } from '@/common/utils/zod/optional-env-int';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * Bottleneck 限流配置（自包含）
 *
 * 基于 bottleneck 库的限流模块配置，支持内存模式和 Redis 分布式模式。
 * redis 模式下只读取 `BOTTLENECK_*` 自己的环境变量（HOST/PORT/DB 必填，
 * 缺失直接启动报错），连接拓扑支持 single / sentinel / cluster
 * （`BOTTLENECK_REDIS_MODE`，默认 single）。
 *
 * .env 示例（`${REDIS_HOST}` 等为 .env 内的公共锚点变量）：
 * BOTTLENECK_MODE=redis
 * BOTTLENECK_REDIS_HOST=${REDIS_HOST}
 * BOTTLENECK_REDIS_PORT=${REDIS_PORT}
 * BOTTLENECK_REDIS_PASSWORD=${REDIS_PASSWORD}
 * BOTTLENECK_REDIS_DB=3
 * BOTTLENECK_REDIS_KEY_PREFIX=bottleneck
 */
const environmentSchema = z.object({
  /** 限流模式：'redis' 表示分布式限流（基于 Redis），'memory' 表示内存限流（单机），默认 'memory' */
  BOTTLENECK_MODE: z.enum(['redis', 'memory']).optional(),
  /** Redis 连接拓扑（仅 redis 模式）：single / sentinel / cluster，默认 single */
  BOTTLENECK_REDIS_MODE: z.enum(['single', 'sentinel', 'cluster']).optional(),
  BOTTLENECK_REDIS_HOST: z.string().min(1).optional(),
  BOTTLENECK_REDIS_PORT: optionalEnvInt(1),
  BOTTLENECK_REDIS_PASSWORD: z.string().optional(),
  BOTTLENECK_REDIS_DB: optionalEnvInt(0),
  BOTTLENECK_REDIS_SENTINEL_MASTER_NAME: z.string().min(1).optional(),
  BOTTLENECK_REDIS_SENTINELS: z.string().min(1).optional(),
  BOTTLENECK_REDIS_CLUSTER_NODES: z.string().min(1).optional(),
  /** Redis Key 前缀（仅 redis 模式），用于区分不同模块的 Redis key，避免冲突 */
  BOTTLENECK_REDIS_KEY_PREFIX: z.string().optional(),
});

const bottleneckConfig = registerEnvAsConfig(
  'bottleneck',
  environmentSchema,
  (env) => {
    const mode = env.BOTTLENECK_MODE ?? 'memory';
    return {
      mode,
      keyPrefix: env.BOTTLENECK_REDIS_KEY_PREFIX ?? 'bottleneck',
      // 仅 redis 模式解析连接（memory 模式不要求任何 Redis 变量）
      connection:
        mode === 'redis'
          ? resolveRedisConnection({
              envPrefix: 'BOTTLENECK_REDIS',
              mode: env.BOTTLENECK_REDIS_MODE,
              host: env.BOTTLENECK_REDIS_HOST,
              port: env.BOTTLENECK_REDIS_PORT,
              password: env.BOTTLENECK_REDIS_PASSWORD,
              db: env.BOTTLENECK_REDIS_DB,
              sentinelMasterName: env.BOTTLENECK_REDIS_SENTINEL_MASTER_NAME,
              sentinels: env.BOTTLENECK_REDIS_SENTINELS,
              clusterNodes: env.BOTTLENECK_REDIS_CLUSTER_NODES,
            })
          : null,
    };
  },
);
export default bottleneckConfig;
export type BottleneckConfigType = ConfigType<typeof bottleneckConfig>;
