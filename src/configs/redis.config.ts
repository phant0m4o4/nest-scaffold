import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import type { ConfigType } from '@nestjs/config';
import { z } from 'zod';

type RedisMode = 'single' | 'sentinel' | 'cluster';

const environmentSchema = z
  .object({
    REDIS_MODE: z.enum(['single', 'sentinel', 'cluster']).optional(),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.coerce.number().int().optional(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().optional(),
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
          db: env.REDIS_DB ?? 0,
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
          db: env.REDIS_DB ?? 0,
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
export type RedisModuleConfig = IRedisConfig;
export type RedisConfigType = ConfigType<typeof redisConfig>;
