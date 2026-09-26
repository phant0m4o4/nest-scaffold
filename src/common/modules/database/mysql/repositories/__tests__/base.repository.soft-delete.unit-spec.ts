import { MySqlDatabaseType } from '@/common/modules/database/mysql/common/types/mysql-database.type';
import { createPrimaryKeyColumn } from '@/database/mysql/utils/create-primary-key';
import { describe, expect, it, vi } from 'vitest';
import { mysqlTable, timestamp } from 'drizzle-orm/mysql-core';

import { BaseRepository } from '../base.repository';

const softDeleteSchema = mysqlTable('soft_delete_probe', {
  id: createPrimaryKeyColumn(),
  deletedAt: timestamp(),
});

/** 探测软删除过滤是否接入 findAll / findManyWithPagination */
class SoftDeleteProbeRepository extends BaseRepository<
  typeof softDeleteSchema
> {
  public lastWhere: unknown;

  constructor(db: MySqlDatabaseType) {
    super(softDeleteSchema, db);
  }

  protected override _buildWhereFilter(
    filter?: Parameters<
      BaseRepository<typeof softDeleteSchema>['_buildWhereFilter']
    >[0],
    ignoreSoftDelete?: boolean,
  ) {
    const actual = super._buildWhereFilter(filter, ignoreSoftDelete);
    this.lastWhere = actual;
    return actual;
  }
}

function createSelectMock() {
  const query = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: (onfulfilled: (value: unknown[]) => unknown) =>
      Promise.resolve([]).then(onfulfilled),
  };
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    }),
  } as unknown as MySqlDatabaseType;
  return { db, query };
}

describe('BaseRepository 软删除过滤', () => {
  it('findAll 应附加软删除 where（即使无业务 filter）', async () => {
    const { db, query } = createSelectMock();
    const repository = new SoftDeleteProbeRepository(db);

    await repository.findAll({});

    expect(repository.lastWhere).toBeDefined();
    expect(query.where).toHaveBeenCalledWith(repository.lastWhere);
  });

  it('findManyWithPagination 在无 filter 时也应附加软删除 where', async () => {
    const { db, query } = createSelectMock();
    // count 与 data 各一次 select().from()
    const repository = new SoftDeleteProbeRepository(db);

    await repository.findManyWithPagination({ page: 1, pageSize: 10 });

    expect(repository.lastWhere).toBeDefined();
    expect(query.where).toHaveBeenCalled();
  });
});
