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
} from 'drizzle-orm/mysql-core';
import {
  PgDialect,
  pgTable,
  serial as pgSerial,
  timestamp as pgTimestamp,
} from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

const mysqlSchema = mysqlTable('soft_delete_alias_probe', {
  id: serial().primaryKey(),
  deletedAt: timestamp('deleted_at'),
});
const pgsqlSchema = pgTable('soft_delete_alias_probe', {
  id: pgSerial().primaryKey(),
  deletedAt: pgTimestamp('deleted_at'),
});

function createRepository(dialect: 'mysql' | 'pgsql') {
  const query = {
    set: vi.fn<(value: { deletedAt: Date }) => unknown>().mockReturnThis(),
    where: vi.fn<(condition: SQL) => unknown>().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(
        dialect === 'mysql' ? [{ affectedRows: 1 }] : [{ id: 1 }],
      ).then(resolve),
  };
  const db = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(query) }),
    update: vi.fn().mockReturnValue(query),
    delete: vi.fn().mockReturnValue(query),
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
    sqlDialect: dialect === 'mysql' ? new MySqlDialect() : new PgDialect(),
    db,
    query,
  };
}

describe.each(['mysql', 'pgsql'] as const)('%s 软删除列别名', (dialect) => {
  it('查询应按 deletedAt 属性识别软删除，并生成真实 deleted_at 列过滤', async () => {
    const { repository, query, sqlDialect } = createRepository(dialect);

    await repository.findAll();

    expect(query.where).toHaveBeenCalledOnce();
    expect(sqlDialect.sqlToQuery(query.where.mock.calls[0][0]).sql).toContain(
      dialect === 'mysql' ? '`deleted_at` is null' : '"deleted_at" is null',
    );
  });

  it('单条删除必须执行软删除，不能因 SQL 列名别名而物理删除', async () => {
    const { repository, db, query, sqlDialect } = createRepository(dialect);

    await repository.delete({ id: 1 });

    expect(db.delete).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledOnce();
    expect(query.set).toHaveBeenCalledOnce();
    expect(query.set.mock.calls[0][0].deletedAt).toBeInstanceOf(Date);
    expect(sqlDialect.sqlToQuery(query.where.mock.calls[0][0]).sql).toContain(
      dialect === 'mysql' ? '`deleted_at` is null' : '"deleted_at" is null',
    );
  });

  it('批量删除同样应更新 deletedAt，而不是物理删除', async () => {
    const { repository, db, query } = createRepository(dialect);
    vi.spyOn(repository, 'findMany').mockResolvedValue([
      { id: 1, deletedAt: null },
    ]);

    await repository.batchDelete({ ids: [1] });

    expect(db.delete).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledOnce();
    expect(query.set).toHaveBeenCalledOnce();
    expect(query.set.mock.calls[0][0].deletedAt).toBeInstanceOf(Date);
  });
});
