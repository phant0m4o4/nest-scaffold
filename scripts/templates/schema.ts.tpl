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
 * - 公开串列名按**业务语义**命名（下方 publicId / shortPublicId 仅为脚手架占位，
 *   请改成如 accessKey / inviteCode，并同步仓储、DTO、路由参数名）
 */
export const __featuresCamel__Schema = mysqlTable(
  '__features__',
  {
    id: createPrimaryKeyColumn(),
    /** 长码占位：请改成业务名，如 accessKey */
    publicId: createPublicIdColumn(),
    /** 短码占位：请改成业务名，如 inviteCode */
    shortPublicId: createPublicIdColumn('shortPublicId', 8),
    name: varchar({ length: 100 }).notNull(),
    ...createTimestamps(),
  },
  (table) => [
    unique().on(table.publicId),
    unique().on(table.shortPublicId),
  ],
);
