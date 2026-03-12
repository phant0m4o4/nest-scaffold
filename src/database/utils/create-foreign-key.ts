import { int } from 'drizzle-orm/mysql-core';

/**
 * 创建外键整型列（默认列名：parentId）
 */
export const createForeignKeyColumn = (name?: string) => {
  if (name) {
    return int(name, { unsigned: true });
  }
  return int({ unsigned: true });
};
