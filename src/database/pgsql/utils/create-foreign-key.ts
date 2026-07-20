import { integer } from 'drizzle-orm/pg-core';

/**
 * 创建外键整型列（默认列名：parentId）
 */
export const createForeignKeyColumn = (name?: string) => {
  if (name) {
    return integer(name);
  }
  return integer();
};
