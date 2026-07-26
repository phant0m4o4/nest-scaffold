/** single 模式连接配置 */
interface IRedisSingleModeConfig {
  readonly mode: 'single';
  readonly single: {
    readonly host: string;
    readonly port: number;
    readonly password?: string;
    readonly db: number;
  };
}
/** sentinel 模式连接配置 */
interface IRedisSentinelModeConfig {
  readonly mode: 'sentinel';
  readonly sentinel: {
    readonly masterName: string;
    readonly sentinels: Array<{ host: string; port: number }>;
    readonly password?: string;
    readonly db: number;
  };
}
/** cluster 模式连接配置 */
interface IRedisClusterModeConfig {
  readonly mode: 'cluster';
  readonly cluster: {
    readonly nodes: Array<{ host: string; port: number }>;
    readonly password?: string;
  };
}

/** 解析后的 Redis 连接配置（三种模式联合） */
export type RedisConnectionConfig =
  | IRedisSingleModeConfig
  | IRedisSentinelModeConfig
  | IRedisClusterModeConfig;

/**
 * 各模块环境变量映射后的连接入参
 *
 * 字段与模块自己的 `<PREFIX>_MODE` / `<PREFIX>_HOST` 等环境变量一一对应，
 * `envPrefix` 仅用于缺失报错时指出具体变量名。
 */
interface IRedisConnectionEnvInput {
  readonly envPrefix: string;
  readonly mode?: 'single' | 'sentinel' | 'cluster';
  readonly host?: string;
  readonly port?: number;
  readonly password?: string;
  readonly db?: number;
  readonly sentinelMasterName?: string;
  readonly sentinels?: string;
  readonly clusterNodes?: string;
}

/** 解析 `host:port,host:port` 形式的节点列表 */
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
        throw new Error(`Redis 节点格式错误: ${item}`);
      }
      return { host, port: parsedPort };
    });
}

/** 断言必填字段存在，缺失时用完整环境变量名报错（启动即失败） */
function requireField<T>(
  value: T | undefined,
  envPrefix: string,
  suffix: string,
): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `Redis 连接配置缺失: 环境变量 ${envPrefix}_${suffix} 必填（各模块自带连接配置，不读取其他模块）`,
    );
  }
  return value;
}

/** 解析节点列表并断言非空（空白/纯逗号会解析出空列表，同样按缺失报错） */
function requireNodes(
  value: string | undefined,
  envPrefix: string,
  suffix: string,
): Array<{ host: string; port: number }> {
  const nodes = parseHostPortPairs(requireField(value, envPrefix, suffix));
  if (nodes.length === 0) {
    throw new Error(
      `Redis 连接配置无效: 环境变量 ${envPrefix}_${suffix} 未包含任何有效的 host:port 节点`,
    );
  }
  return nodes;
}

/**
 * 将模块自己的 `<PREFIX>_REDIS_*` 环境变量解析为 Redis 连接配置
 *
 * 每个需要 Redis 的模块（缓存、锁等）只读取自己命名空间下的变量；
 * 必填项缺失会在此处抛错、阻止应用启动，不会静默回退到其他模块的配置。
 * `.env` 中可通过 `${REDIS_HOST}` 等锚点变量避免重复书写公共地址。
 */
export function resolveRedisConnection(
  input: IRedisConnectionEnvInput,
): RedisConnectionConfig {
  const { envPrefix } = input;
  const mode = input.mode ?? 'single';
  // 空串密码视为未设置（锚点变量缺失时 ${...} 会展开为空串）
  const password =
    input.password === undefined || input.password === ''
      ? undefined
      : input.password;
  if (mode === 'single') {
    return {
      mode,
      single: {
        host: requireField(input.host, envPrefix, 'HOST'),
        port: requireField(input.port, envPrefix, 'PORT'),
        password,
        db: requireField(input.db, envPrefix, 'DB'),
      },
    };
  }
  if (mode === 'sentinel') {
    return {
      mode,
      sentinel: {
        masterName: requireField(
          input.sentinelMasterName,
          envPrefix,
          'SENTINEL_MASTER_NAME',
        ),
        sentinels: requireNodes(input.sentinels, envPrefix, 'SENTINELS'),
        password,
        db: requireField(input.db, envPrefix, 'DB'),
      },
    };
  }
  // cluster 无 DB 概念:显式设置 DB 却被静默丢弃会制造「已隔离」的假象
  // (实际同处一个 keyspace,只剩键前缀),必须启动即报错
  if (input.db !== undefined) {
    throw new Error(
      `Redis 连接配置冲突: 环境变量 ${envPrefix}_DB 在 cluster 模式下无效——Redis Cluster 无 DB 概念,无法用 DB 隔离。请移除该变量,并为本模块部署独立集群来实现隔离`,
    );
  }
  return {
    mode,
    cluster: {
      nodes: requireNodes(input.clusterNodes, envPrefix, 'CLUSTER_NODES'),
      password,
    },
  };
}
