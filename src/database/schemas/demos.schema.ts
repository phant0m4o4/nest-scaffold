import {
  foreignKey,
  mysqlEnum,
  mysqlTable,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';
import { DemoTypeEnum, demoTypes } from '../enums/demo-type.enum';
import { createForeignKeyColumn } from '../utils/create-foreign-key';
import { createPrimaryKeyColumn } from '../utils/create-primary-key';
import { createTimestamps } from '../utils/create-time-stamps';
export const demosSchema = mysqlTable(
  'demos',
  {
    id: createPrimaryKeyColumn(),
    name: varchar({ length: 100 }).notNull(), // 名称
    type: mysqlEnum(demoTypes).notNull().default(DemoTypeEnum.TYPE_1), // 类型
    parentId: createForeignKeyColumn(),
    ...createTimestamps(), // 时间戳
  },
  (table) => [
    unique().on(table.name),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: `parent_id_fk`,
    }),
  ],
);
