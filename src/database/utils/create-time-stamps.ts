import { timestamp } from 'drizzle-orm/mysql-core';

/**
 * 创建时间戳
 */
export const createTimestamps = () => ({
  createdAt: timestamp().notNull().defaultNow(), // 创建时间
  updatedAt: timestamp().notNull().defaultNow().onUpdateNow(), // 更新时间
});

/**
 * 创建时间戳，包含软删除时间
 */
export const createTimestampsWithSoftDelete = () => ({
  ...createTimestamps(),
  deletedAt: timestamp(), // 删除时间
});
