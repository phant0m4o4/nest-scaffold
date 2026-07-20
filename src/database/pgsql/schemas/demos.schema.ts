import {
  foreignKey,
  pgEnum,
  pgTable,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { DemoTypeEnum, demoTypes } from '../../enums/demo-type.enum';
import { createForeignKeyColumn } from '../utils/create-foreign-key';
import { createPrimaryKeyColumn } from '../utils/create-primary-key';
import { createTimestamps } from '../utils/create-time-stamps';

// PostgreSQL 枚举是独立的数据库类型，需要单独声明并导出（drizzle-kit 依赖导出生成 CREATE TYPE）
export const demoTypeEnum = pgEnum('demo_type', demoTypes);

export const demosSchema = pgTable(
  'demos',
  {
    id: createPrimaryKeyColumn(),
    name: varchar({ length: 100 }).notNull(), // 名称
    type: demoTypeEnum().notNull().default(DemoTypeEnum.TYPE_1), // 类型
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
