import type { RedisConnectionConfig } from '@/common/utils/redis/redis-connection';
import type { ConnectionOptions } from 'bullmq';
import { Cluster } from 'ioredis';

/**
 * 将模块自己的 Redis 连接配置映射为 BullMQ 连接选项
 *
 * - single / sentinel：以 ioredis 选项对象传入（BullMQ 内部自行创建连接）
 * - cluster：BullMQ 不接受 cluster 选项对象，需传入现成的 `Cluster` 实例；
 *   该实例由 BullMQ 复用/duplicate，生命周期随进程（队列为常驻服务）
 *
 * BullMQ worker 走 blocking 命令，必须 `maxRetriesPerRequest: null`。
 */
export function buildBullMqConnection(
  connection: RedisConnectionConfig,
): ConnectionOptions {
  if (connection.mode === 'single') {
    return { ...connection.single, maxRetriesPerRequest: null };
  }
  if (connection.mode === 'sentinel') {
    const { masterName, sentinels, password, db } = connection.sentinel;
    return {
      name: masterName,
      sentinels: sentinels.map((node) => ({ ...node })),
      password,
      db,
      maxRetriesPerRequest: null,
    };
  }
  return new Cluster(
    connection.cluster.nodes.map((node) => ({ ...node })),
    {
      redisOptions: {
        password: connection.cluster.password,
        maxRetriesPerRequest: null,
      },
    },
  );
}
