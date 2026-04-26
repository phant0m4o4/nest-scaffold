import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { createPrimaryKeyColumn } from '../utils/create-primary-key';
import { createTimestamps } from '../utils/create-time-stamps';
// 启用软删除时改用：
// import { createTimestampsWithSoftDelete } from '../utils/create-time-stamps';

/**
 * __features__ 表
 */
export const __featuresCamel__Schema = mysqlTable('__features__', {
  id: createPrimaryKeyColumn(),
  name: varchar({ length: 100 }).notNull(),
  ...createTimestamps(),
});
