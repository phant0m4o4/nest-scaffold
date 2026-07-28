import { mysqlTable, unique, varchar } from 'drizzle-orm/mysql-core';
import { createPrimaryKeyColumn } from '../utils/create-primary-key';
import { createPublicIdColumn } from '../utils/create-public-id';
import { createTimestamps } from '../utils/create-time-stamps';
// 启用软删除时改用：
// import { createTimestampsWithSoftDelete } from '../utils/create-time-stamps';

/**
 * __features__ 表
 *
 * - id：bigint 自增主键，仅内部 / admin 使用
 * - publicId：长码（默认 21），用户端路径/读查（不需要对外隐藏主键时可删）
 * - shortPublicId：短码（长度 8），推荐码等（不需要可删）
 */
export const __featuresCamel__Schema = mysqlTable(
  '__features__',
  {
    id: createPrimaryKeyColumn(),
    publicId: createPublicIdColumn(),
    shortPublicId: createPublicIdColumn('shortPublicId', 8),
    name: varchar({ length: 100 }).notNull(),
    ...createTimestamps(),
  },
  (table) => [
    unique().on(table.publicId),
    unique().on(table.shortPublicId),
  ],
);
