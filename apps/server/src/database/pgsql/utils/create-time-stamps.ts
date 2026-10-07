import { timestamp } from 'drizzle-orm/pg-core';

/**
 * 创建时间戳
 *
 * PostgreSQL 没有 MySQL 的 ON UPDATE CURRENT_TIMESTAMP，
 * updatedAt 由 Drizzle 的 `$onUpdate` 在应用层写入（仅经由 Drizzle 的更新生效）。
 */
export const createTimestamps = () => ({
  createdAt: timestamp().notNull().defaultNow(), // 创建时间
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 更新时间
});

/**
 * 创建时间戳，包含软删除时间
 */
export const createTimestampsWithSoftDelete = () => ({
  ...createTimestamps(),
  deletedAt: timestamp(), // 删除时间
});
