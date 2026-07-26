import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import type { ConfigType } from '@nestjs/config';
import { z } from 'zod';

type RedisMode = 'single' | 'sentinel' | 'cluster';

/**
 * Redis 基础连接配置（地址 / 鉴权 / 拓扑）
 *
 * 本项目**没有共享 Redis 客户端**：每个需要 Redis 的模块（缓存、锁、队列等）
 * 复用这里的地址/密码/拓扑，通过 `@/common/utils/redis/redis.factory` 自建连接，
 * 并用各自的 `*_REDIS_DB` 环境变量指定独立 DB（`db` 字段在此仅作默认值 0，
 * 由使用方按模块覆写）。
 */
const environmentSchema = z
  .object({
    REDIS_MODE: z.enum(['single', 'sentinel', 'cluster']).optional(),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.coerce.number().int().optional(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_SENTINEL_MASTER_NAME: z.string().min(1).optional(),
    REDIS_SENTINELS: z.string().min(1).optional(),
    REDIS_CLUSTER_NODES: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    const mode = env.REDIS_MODE ?? 'single';
    if (mode === 'sentinel') {
      if (!env.REDIS_SENTINEL_MASTER_NAME) {
        ctx.addIssue({
          code: 'custom',
          path: ['REDIS_SENTINEL_MASTER_NAME'],
          message: 'sentinel 模式下必填',
        });
      }
      if (!env.REDIS_SENTINELS) {
        ctx.addIssue({
          code: 'custom',
          path: ['REDIS_SENTINELS'],
          message: 'sentinel 模式下必填',
        });
      }
    }
    if (mode === 'cluster' && !env.REDIS_CLUSTER_NODES) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_CLUSTER_NODES'],
        message: 'cluster 模式下必填',
      });
    }
  });

interface IRedisSingleModeConfig {
  readonly mode: 'single';
  readonly single: {
    readonly host: string;
    readonly port: number;
    readonly password?: string;
    readonly db: number;
  };
}
interface IRedisSentinelModeConfig {
  readonly mode: 'sentinel';
  readonly sentinel: {
    readonly masterName: string;
    readonly sentinels: Array<{ host: string; port: number }>;
    readonly password?: string;
    readonly db: number;
  };
}
interface IRedisClusterModeConfig {
  readonly mode: 'cluster';
  readonly cluster: {
    readonly nodes: Array<{ host: string; port: number }>;
    readonly password?: string;
  };
}
type IRedisConfig =
  | IRedisSingleModeConfig
  | IRedisSentinelModeConfig
  | IRedisClusterModeConfig;

function parseHostPortPairs(
  input: string | undefined,
): Array<{ host: string; port: number }> {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      const [host, port] = item.split(':');
      const parsedPort = Number(port);
      if (!host || Number.isNaN(parsedPort)) {
        throw new Error(`REDIS 节点格式错误: ${item}`);
      }
      return { host, port: parsedPort };
    });
}

const redisConfig = registerEnvAsConfig(
  'redis',
  environmentSchema,
  (env): IRedisConfig => {
    const mode: RedisMode = env.REDIS_MODE ?? 'single';
    if (mode === 'single') {
      return {
        mode,
        single: {
          host: env.REDIS_HOST ?? '127.0.0.1',
          port: env.REDIS_PORT ?? 6379,
          password: env.REDIS_PASSWORD ?? undefined,
          db: 0, // 默认值，各使用方（缓存/锁等）按模块的 *_REDIS_DB 覆写
        },
      };
    }
    if (mode === 'sentinel') {
      return {
        mode,
        sentinel: {
          masterName: env.REDIS_SENTINEL_MASTER_NAME!,
          sentinels: parseHostPortPairs(env.REDIS_SENTINELS),
          password: env.REDIS_PASSWORD ?? undefined,
          db: 0, // 默认值，各使用方（缓存/锁等）按模块的 *_REDIS_DB 覆写
        },
      };
    }
    return {
      mode,
      cluster: {
        nodes: parseHostPortPairs(env.REDIS_CLUSTER_NODES),
        password: env.REDIS_PASSWORD ?? undefined,
      },
    };
  },
);

export default redisConfig;
export type RedisConnectionConfig = IRedisConfig;
export type RedisConfigType = ConfigType<typeof redisConfig>;
