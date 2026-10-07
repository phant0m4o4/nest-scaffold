import { bigint } from 'drizzle-orm/mysql-core';

/**
 * 创建主键列（默认列名：id）
 *
 * 使用 bigint unsigned：int 上限（约 42.9 亿，自增序号对失败插入也会消耗）
 * 耗尽后的在线改列代价极高，脚手架默认一步到位。
 * `mode: 'number'` 使 JS 侧拿到普通 number（安全上限 2^53-1），
 * zod / JSON 序列化 / 仓储层无需任何适配。
 */
export const createPrimaryKeyColumn = (name?: string) => {
  if (name) {
    return bigint(name, { mode: 'number', unsigned: true })
      .notNull()
      .autoincrement()
      .primaryKey();
  }
  return bigint({ mode: 'number', unsigned: true })
    .notNull()
    .autoincrement()
    .primaryKey();
};
