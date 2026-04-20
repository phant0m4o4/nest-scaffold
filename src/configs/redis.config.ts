import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import type { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

type RedisMode = 'single' | 'sentinel' | 'cluster';

class EnvironmentVariables {
  @Expose()
  @IsIn(['single', 'sentinel', 'cluster'])
  @IsOptional()
  REDIS_MODE?: RedisMode;
  @Expose()
  @IsString()
  @IsOptional()
  REDIS_HOST?: string;
  @Expose()
  @IsInt()
  @IsOptional()
  REDIS_PORT?: number;
  @Expose()
  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;
  @Expose()
  @IsInt()
  @IsOptional()
  REDIS_DB?: number;
  @Expose()
  @IsString()
  @IsNotEmpty()
  @ValidateIf(
    (object: EnvironmentVariables): boolean =>
      (object.REDIS_MODE ?? 'single') === 'sentinel',
  )
  REDIS_SENTINEL_MASTER_NAME?: string;
  @Expose()
  @IsNotEmpty()
  @ValidateIf(
    (object: EnvironmentVariables): boolean =>
      (object.REDIS_MODE ?? 'single') === 'sentinel',
  )
  @IsString()
  REDIS_SENTINELS?: string;
  @Expose()
  @IsString()
  @IsNotEmpty()
  @ValidateIf(
    (object: EnvironmentVariables): boolean =>
      (object.REDIS_MODE ?? 'single') === 'cluster',
  )
  REDIS_CLUSTER_NODES?: string;
}

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
  EnvironmentVariables,
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
