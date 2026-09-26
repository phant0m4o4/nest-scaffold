import type { MySqlDatabaseType } from '@/common/modules/database/mysql/common/types/mysql-database.type';
import { RecordNotFoundException } from '@/common/modules/database/common/repositories/exceptions/record-not-found-exception';
import { createPrimaryKeyColumn } from '@/database/mysql/utils/create-primary-key';
import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { describe, expect, it, vi } from 'vitest';

import { BaseRepository } from '../base.repository';

const mutationProbeSchema = mysqlTable('mutation_probe', {
  id: createPrimaryKeyColumn(),
  name: varchar({ length: 50 }).notNull(),
});

class MutationProbeRepository extends BaseRepository<
  typeof mutationProbeSchema
> {
  constructor(db: MySqlDatabaseType) {
    super(mutationProbeSchema, db);
  }
}

describe('BaseRepository mutation consistency', () => {
  it('batchDelete 应先对重复 id 去重，避免误报记录不存在', async () => {
    const where = vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]);
    const db = {
      delete: vi.fn().mockReturnValue({ where }),
    } as unknown as MySqlDatabaseType;
    const repository = new MutationProbeRepository(db);
    vi.spyOn(repository, 'findMany').mockResolvedValue([
      { id: 1, name: 'one' },
    ]);

    await expect(
      repository.batchDelete({ ids: [1, 1] }),
    ).resolves.toBeUndefined();

    expect(repository.findMany).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });

  it('update 应根据原子更新的 affectedRows 判断记录不存在', async () => {
    const where = vi.fn().mockResolvedValue([{ affectedRows: 0 }, []]);
    const set = vi.fn().mockReturnValue({ where });
    const db = {
      update: vi.fn().mockReturnValue({ set }),
    } as unknown as MySqlDatabaseType;
    const repository = new MutationProbeRepository(db);

    await expect(
      repository.update({ id: 404, data: { name: 'missing' } }),
    ).rejects.toBeInstanceOf(RecordNotFoundException);
  });
});
