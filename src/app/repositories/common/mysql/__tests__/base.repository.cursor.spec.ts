import { MySqlDatabaseType } from '@/common/modules/database/mysql/common/types/mysql-database.type';
import { createPrimaryKeyColumn } from '@/database/mysql/utils/create-primary-key';
import { createTimestamps } from '@/database/mysql/utils/create-time-stamps';
import { describe, expect, it, vi } from 'vitest';
import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';

import { BaseRepository } from '../base.repository';

const cursorProbeSchema = mysqlTable('cursor_probe', {
  id: createPrimaryKeyColumn(),
  name: varchar({ length: 50 }).notNull(),
  ...createTimestamps(),
});

class CursorProbeRepository extends BaseRepository<typeof cursorProbeSchema> {
  constructor(db: MySqlDatabaseType) {
    super(cursorProbeSchema, db);
  }
}

function createSelectMock(rows: unknown[]) {
  const query = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (onfulfilled: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(onfulfilled),
  };
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    }),
  } as unknown as MySqlDatabaseType;
  return { db, query };
}

describe('BaseRepository.findManyWithCursorPagination', () => {
  it('有下一页时应返回末行 keyset（含 id）', async () => {
    const rows = [
      {
        id: 3,
        name: 'c',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        id: 2,
        name: 'b',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 1,
        name: 'a',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const { db, query } = createSelectMock(rows);
    const repository = new CursorProbeRepository(db);

    const actual = await repository.findManyWithCursorPagination({
      limit: 2,
      order: [
        { column: 'createdAt', direction: 'desc' },
        { column: 'id', direction: 'desc' },
      ],
    });

    expect(actual.data).toHaveLength(2);
    expect(actual.data.map((row) => row.id)).toEqual([3, 2]);
    expect(actual.meta.nextCursor).toEqual([
      {
        column: 'createdAt',
        direction: 'desc',
        value: '2026-01-02T00:00:00.000Z',
      },
      { column: 'id', direction: 'desc', value: 2 },
    ]);
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(query.orderBy).toHaveBeenCalled();
  });

  it('无下一页时 nextCursor 应为 null', async () => {
    const { db } = createSelectMock([
      {
        id: 1,
        name: 'a',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const repository = new CursorProbeRepository(db);

    const actual = await repository.findManyWithCursorPagination({
      limit: 10,
      order: [{ column: 'id', direction: 'desc' }],
    });

    expect(actual.meta.nextCursor).toBeNull();
  });

  it('order 最后一列非 id 应抛错', async () => {
    const { db } = createSelectMock([]);
    const repository = new CursorProbeRepository(db);

    await expect(
      repository.findManyWithCursorPagination({
        limit: 10,
        order: [{ column: 'createdAt', direction: 'desc' }],
      }),
    ).rejects.toThrow(/最后一列必须是 id/);
  });

  it('cursor 与 order 声明不一致应抛错', async () => {
    const { db } = createSelectMock([]);
    const repository = new CursorProbeRepository(db);

    await expect(
      repository.findManyWithCursorPagination({
        limit: 10,
        order: [{ column: 'id', direction: 'desc' }],
        cursor: [{ column: 'id', direction: 'asc', value: 1 }],
      }),
    ).rejects.toThrow(/与 order 声明不一致/);
  });

  it('传入 cursor 时应附加 where', async () => {
    const { db, query } = createSelectMock([]);
    const repository = new CursorProbeRepository(db);

    await repository.findManyWithCursorPagination({
      limit: 10,
      order: [{ column: 'id', direction: 'desc' }],
      cursor: [{ column: 'id', direction: 'desc', value: 10 }],
    });

    expect(query.where).toHaveBeenCalled();
  });
});
