import type { Redis } from 'ioredis';

/**
 * 模块自建的 Redis 客户端；单机与哨兵均使用同一种客户端。
 */
export type RedisClient = Redis;
