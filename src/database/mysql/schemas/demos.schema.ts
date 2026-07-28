import {
  foreignKey,
  mysqlEnum,
  mysqlTable,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';
import { DemoTypeEnum, demoTypes } from '../../enums/demo-type.enum';
import { createForeignKeyColumn } from '../utils/create-foreign-key';
import { createPrimaryKeyColumn } from '../utils/create-primary-key';
import { createPublicIdColumn } from '../utils/create-public-id';
import { createTimestamps } from '../utils/create-time-stamps';

export const demosSchema = mysqlTable(
  'demos',
  {
    id: createPrimaryKeyColumn(),
    /** 长码：用户端路径/读查（nanoid 21），不向用户暴露自增 id */
    publicId: createPublicIdColumn(),
    /** 短码：推荐码等（nanoid 8），碰撞策略与长码不同，见 DemoRepository */
    shortPublicId: createPublicIdColumn('shortPublicId', 8),
    name: varchar({ length: 100 }).notNull(), // 名称
    type: mysqlEnum(demoTypes).notNull().default(DemoTypeEnum.TYPE_1), // 类型
    parentId: createForeignKeyColumn(),
    ...createTimestamps(), // 时间戳
  },
  (table) => [
    unique().on(table.publicId),
    unique().on(table.shortPublicId),
    unique().on(table.name),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: `parent_id_fk`,
    }),
  ],
);
