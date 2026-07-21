import { bigint } from 'drizzle-orm/pg-core';

/**
 * 创建主键列（默认列名：id）
 *
 * PostgreSQL 使用 bigint GENERATED ALWAYS AS IDENTITY 自增主键：
 * integer 上限（约 21.4 亿）耗尽后的在线改列代价极高，脚手架默认一步到位。
 * `mode: 'number'` 使 JS 侧拿到普通 number（安全上限 2^53-1），
 * zod / JSON 序列化 / 仓储层无需任何适配。
 */
export const createPrimaryKeyColumn = (name?: string) => {
  if (name) {
    return bigint(name, { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity();
  }
  return bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();
};
