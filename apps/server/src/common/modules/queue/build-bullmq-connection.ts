import type { RedisConnectionConfig } from '@/common/utils/redis/redis-connection';
import type { ConnectionOptions } from 'bullmq';

/**
 * 将模块自己的 Redis 连接配置映射为 BullMQ 连接选项
 *
 * single / sentinel 均传入选项对象，连接创建和关闭由 BullMQ 自行管理。
 *
 * BullMQ worker 走 blocking 命令，必须 `maxRetriesPerRequest: null`。
 */
export function buildBullMqConnection(
  connection: RedisConnectionConfig,
): ConnectionOptions {
  if (connection.mode === 'single') {
    return { ...connection.single, maxRetriesPerRequest: null };
  }
  const { masterName, sentinels, password, db } = connection.sentinel;
  return {
    name: masterName,
    sentinels: sentinels.map((node) => ({ ...node })),
    password,
    db,
    maxRetriesPerRequest: null,
  };
}
