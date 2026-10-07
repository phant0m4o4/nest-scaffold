import type { MySqlDatabaseType } from '@/common/modules/database/mysql/common/types/mysql-database.type';
import { BaseRepository as MysqlBaseRepository } from '@/common/modules/database/mysql/repositories/base.repository';
import type { PgsqlDatabaseType } from '@/common/modules/database/pgsql/common/types/pgsql-database.type';
import { BaseRepository as PgsqlBaseRepository } from '@/common/modules/database/pgsql/repositories/base.repository';
import type { SQL } from 'drizzle-orm';
import {
  MySqlDialect,
  mysqlTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  PgDialect,
  pgTable,
  serial as pgSerial,
  timestamp as pgTimestamp,
  varchar as pgVarchar,
} from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

const mysqlSchema = mysqlTable('cursor_type_probe', {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  createdAt: timestamp().notNull(),
});
const pgsqlSchema = pgTable('cursor_type_probe', {
  id: pgSerial().primaryKey(),
  name: pgVarchar({ length: 100 }).notNull(),
  createdAt: pgTimestamp().notNull(),
});

function createRepository(dialect: 'mysql' | 'pgsql') {
  const query = {
    where: vi.fn<(condition: SQL) => unknown>().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve([]).then(resolve),
  };
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    }),
  };
  class MysqlProbe extends MysqlBaseRepository<typeof mysqlSchema> {
    constructor() {
      super(mysqlSchema, db as unknown as MySqlDatabaseType);
    }
  }
  class PgsqlProbe extends PgsqlBaseRepository<typeof pgsqlSchema> {
    constructor() {
      super(pgsqlSchema, db as unknown as PgsqlDatabaseType);
    }
  }
  return {
    repository: dialect === 'mysql' ? new MysqlProbe() : new PgsqlProbe(),
    dialect: dialect === 'mysql' ? new MySqlDialect() : new PgDialect(),
    query,
  };
}

describe.each(['mysql', 'pgsql'] as const)('%s 游标查询值类型', (dialect) => {
  it.each(['asc', 'desc'] as const)(
    'ISO 格式字符串按 %s 翻页时比较与相等前缀均应保持字符串',
    async (direction) => {
      const probe = createRepository(dialect);
      const value = '2026-07-01T12:00:00.000Z';
      await probe.repository.findManyWithCursorPagination({
        limit: 1,
        order: [
          { column: 'name', direction },
          { column: 'id', direction },
        ],
        cursor: [
          { column: 'name', direction, value },
          { column: 'id', direction, value: 7 },
        ],
      });

      const condition = probe.query.where.mock.calls[0][0];
      expect(probe.dialect.sqlToQuery(condition).params).toEqual([
        value,
        value,
        7,
      ]);
    },
  );

  it('日期列仍应恢复 Date 并交由真实 Drizzle 编码器处理', async () => {
    const probe = createRepository(dialect);
    const value = '2026-07-01T12:00:00.000Z';
    await probe.repository.findManyWithCursorPagination({
      limit: 1,
      order: [
        { column: 'createdAt', direction: 'desc' },
        { column: 'id', direction: 'desc' },
      ],
      cursor: [
        { column: 'createdAt', direction: 'desc', value },
        { column: 'id', direction: 'desc', value: 7 },
      ],
    });

    const condition = probe.query.where.mock.calls[0][0];
    const encodedDate = dialect === 'mysql' ? '2026-07-01 12:00:00.000' : value;
    expect(probe.dialect.sqlToQuery(condition).params).toEqual([
      encodedDate,
      encodedDate,
      7,
    ]);
  });
});
