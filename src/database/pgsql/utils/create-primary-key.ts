import { integer } from 'drizzle-orm/pg-core';

/**
 * 创建主键列（默认列名：id）
 *
 * PostgreSQL 使用标准的 GENERATED ALWAYS AS IDENTITY 自增主键。
 */
export const createPrimaryKeyColumn = (name?: string) => {
  if (name) {
    return integer(name).primaryKey().generatedAlwaysAsIdentity();
  }
  return integer().primaryKey().generatedAlwaysAsIdentity();
};
