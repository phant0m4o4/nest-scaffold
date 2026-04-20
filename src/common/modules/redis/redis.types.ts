import type { Cluster, Redis } from 'ioredis';

/**
 * Redis 客户端联合类型
 *
 * - 当配置 mode = single 或 sentinel 时为 ioredis 的 `Redis` 实例
 * - 当配置 mode = cluster 时为 ioredis 的 `Cluster` 实例
 *
 * 业务调用方应优先使用本类型，少数仅 `Redis` 或仅 `Cluster` 才支持的命令
 * 需要在使用处自行做 instanceof 收窄。
 */
export type RedisClient = Redis | Cluster;
