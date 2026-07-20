import { int } from 'drizzle-orm/mysql-core';

/**
 * 创建主键列（默认列名：id）
 */
export const createPrimaryKeyColumn = (name?: string) => {
  if (name) {
    return int(name, { unsigned: true }).notNull().autoincrement().primaryKey();
  }
  return int({ unsigned: true }).notNull().autoincrement().primaryKey();
};
