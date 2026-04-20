import { normalizeError } from '@/common/utils/normalize-error';
import type { RedisModuleConfig } from '@/configs/redis.config';
import { Cluster, Redis } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';

import type { RedisClient } from './redis.types';

/**
 * 创建 Redis 客户端的入参
 */
interface ICreateRedisClientParams {
  /** 由 ConfigService 加载的 Redis 配置（已包含 mode 与对应分支） */
  readonly config: RedisModuleConfig;
  /** PinoLogger 实例，用于挂载 connect / ready / error / close 事件日志 */
  readonly logger: PinoLogger;
}

/**
 * 关闭 Redis 客户端的入参
 */
interface ICloseRedisClientParams {
  /** 待关闭的 Redis / Cluster 客户端 */
  readonly client: RedisClient;
  /** PinoLogger 实例，用于关闭过程中的结构化日志 */
  readonly logger: PinoLogger;
}

/** 处于活跃状态的客户端 status 集合，仅这些状态使用 quit() 优雅关闭 */
const ACTIVE_CLIENT_STATUSES: ReadonlySet<string> = new Set([
  'ready',
  'connect',
  'connecting',
]);

/**
 * 为 Redis / Cluster 客户端挂载统一的事件日志监听
 *
 * 所有 logger 调用均为同步操作，避免在事件回调中产生未处理的 Promise。
 * @private
 */
function attachClientEventListeners(
  client: RedisClient,
  logger: PinoLogger,
): void {
  client.on('connect', () => {
    logger.info('Redis 正在建立连接');
  });
  client.on('ready', () => {
    logger.info('Redis 连接就绪');
  });
  client.on('error', (error: unknown) => {
    logger.error(
      { event: 'redis_error', error: normalizeError(error) },
      'Redis 客户端错误',
    );
  });
  client.on('close', () => {
    logger.warn('Redis 连接已关闭');
  });
}

/**
 * 根据配置创建 single 模式的 Redis 客户端
 * @private
 */
function createSingleClient(
  config: Extract<RedisModuleConfig, { mode: 'single' }>,
): Redis {
  const { host, port, password, db } = config.single;
  return new Redis({
    host,
    port,
    password,
    db,
  });
}

/**
 * 根据配置创建 sentinel 模式的 Redis 客户端
 * @private
 */
function createSentinelClient(
  config: Extract<RedisModuleConfig, { mode: 'sentinel' }>,
): Redis {
  const { masterName, sentinels, password, db } = config.sentinel;
  return new Redis({
    name: masterName,
    sentinels: sentinels.map((node) => ({ host: node.host, port: node.port })),
    password,
    db,
  });
}

/**
 * 根据配置创建 cluster 模式的 Redis 客户端
 * @private
 */
function createClusterClient(
  config: Extract<RedisModuleConfig, { mode: 'cluster' }>,
): Cluster {
  const { nodes, password } = config.cluster;
  return new Cluster(
    nodes.map((node) => ({ host: node.host, port: node.port })),
    {
      redisOptions: {
        password,
      },
    },
  );
}

/**
 * 根据配置构造对应的 Redis 客户端，并统一挂载事件日志
 *
 * @param params.config 已校验的 Redis 配置
 * @param params.logger PinoLogger 实例
 * @returns Redis | Cluster 实例
 */
export function createRedisClient(
  params: ICreateRedisClientParams,
): RedisClient {
  const { config, logger } = params;
  let client: RedisClient;
  if (config.mode === 'single') {
    client = createSingleClient(config);
  } else if (config.mode === 'sentinel') {
    client = createSentinelClient(config);
  } else {
    client = createClusterClient(config);
  }
  attachClientEventListeners(client, logger);
  return client;
}

/**
 * 优雅关闭 Redis / Cluster 客户端
 *
 * - 当客户端处于活跃状态时使用 `quit()`（发送 QUIT 后等待响应再断开）
 * - 否则直接 `disconnect()`
 * - 任何关闭异常都会被吞掉并以 warn 日志输出，保证调用方流程不被打断
 *
 * @param params.client 客户端实例
 * @param params.logger PinoLogger 实例
 */
export async function closeRedisClient(
  params: ICloseRedisClientParams,
): Promise<void> {
  const { client, logger } = params;
  try {
    if (ACTIVE_CLIENT_STATUSES.has(client.status)) {
      await client.quit();
    } else {
      client.disconnect();
    }
    logger.info('Redis 连接已优雅关闭');
  } catch (error: unknown) {
    logger.warn(
      { event: 'redis_close_warn', error: normalizeError(error) },
      'Redis 连接关闭时发生错误，可能已关闭',
    );
  }
}
