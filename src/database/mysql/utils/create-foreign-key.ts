import { bigint } from 'drizzle-orm/mysql-core';

/**
 * 创建外键整型列（默认列名：parentId）
 *
 * 与 createPrimaryKeyColumn 的 bigint unsigned 保持一致，
 * 类型不匹配将无法建立外键约束。
 */
export const createForeignKeyColumn = (name?: string) => {
  if (name) {
    return bigint(name, { mode: 'number', unsigned: true });
  }
  return bigint({ mode: 'number', unsigned: true });
};
