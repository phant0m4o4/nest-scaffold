import { DeadlockDetectedException } from '@/common/modules/database/common/repositories/exceptions/deadlock-detected-exception';
import { ForeignKeyConstraintViolationException } from '@/common/modules/database/common/repositories/exceptions/foreign-key-constraint-violation-exception';
import { LockWaitTimeoutException } from '@/common/modules/database/common/repositories/exceptions/lock-wait-timeout-exception';
import { RecordNotFoundException } from '@/common/modules/database/common/repositories/exceptions/record-not-found-exception';
import type { MySqlDatabaseType } from '@/common/modules/database/mysql/common/types/mysql-database.type';
import { BaseRepository as MysqlBaseRepository } from '@/common/modules/database/mysql/repositories/base.repository';
import type { PgsqlDatabaseType } from '@/common/modules/database/pgsql/common/types/pgsql-database.type';
import { BaseRepository as PgsqlBaseRepository } from '@/common/modules/database/pgsql/repositories/base.repository';
import { mysqlTable, serial, timestamp } from 'drizzle-orm/mysql-core';
import {
  pgTable,
  serial as pgSerial,
  timestamp as pgTimestamp,
} from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

const mysqlHardSchema = mysqlTable('delete_hard_probe', {
  id: serial().primaryKey(),
});
const mysqlSoftSchema = mysqlTable('delete_soft_probe', {
  id: serial().primaryKey(),
  deletedAt: timestamp(),
});
const pgsqlHardSchema = pgTable('delete_hard_probe', {
  id: pgSerial().primaryKey(),
});
const pgsqlSoftSchema = pgTable('delete_soft_probe', {
  id: pgSerial().primaryKey(),
  deletedAt: pgTimestamp(),
});

function createRepository(options: {
  dialect: 'mysql' | 'pgsql';
  softDelete: boolean;
  error?: Error;
  affected?: number;
}) {
  const { dialect, softDelete, error, affected = 1 } = options;
  const query = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: (
      resolve: (value: unknown) => unknown,
      reject: (error: Error) => unknown,
    ) => {
      const result =
        dialect === 'mysql'
          ? [{ affectedRows: affected }, []]
          : affected > 0
            ? [{ id: 1 }]
            : [];
      return (error ? Promise.reject(error) : Promise.resolve(result)).then(
        resolve,
        reject,
      );
    },
  };
  const db = {
    delete: vi.fn().mockReturnValue(query),
    update: vi.fn().mockReturnValue(query),
  };
  const mysqlSchema = softDelete ? mysqlSoftSchema : mysqlHardSchema;
  const pgsqlSchema = softDelete ? pgsqlSoftSchema : pgsqlHardSchema;
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
  const repository = dialect === 'mysql' ? new MysqlProbe() : new PgsqlProbe();
  const findMany = vi
    .spyOn(repository, 'findMany')
    .mockResolvedValue([{ id: 1 }]);
  return { repository, findMany, db };
}

describe.each(['mysql', 'pgsql'] as const)('%s 删除异常映射', (dialect) => {
  describe.each([false, true])('软删除=%s', (softDelete) => {
    const invokeCases = [
      [
        'delete',
        (repository: ReturnType<typeof createRepository>['repository']) =>
          repository.delete({ id: 1 }),
      ],
      [
        'batchDelete',
        (repository: ReturnType<typeof createRepository>['repository']) =>
          repository.batchDelete({ ids: [1] }),
      ],
    ] as const;

    describe.each(invokeCases)('%s', (_method, invoke) => {
      it.each([
        [
          '外键冲突',
          'ER_ROW_IS_REFERENCED_2',
          '23503',
          ForeignKeyConstraintViolationException,
        ],
        ['死锁', 'ER_LOCK_DEADLOCK', '40P01', DeadlockDetectedException],
        [
          '锁等待超时',
          'ER_LOCK_WAIT_TIMEOUT',
          '55P03',
          LockWaitTimeoutException,
        ],
      ] as const)('应映射%s', async (_name, mysqlCode, pgsqlCode, expected) => {
        const error = new Error('测试数据库错误', {
          cause: { code: dialect === 'mysql' ? mysqlCode : pgsqlCode },
        });
        const { repository } = createRepository({ dialect, softDelete, error });

        await expect(invoke(repository)).rejects.toBeInstanceOf(expected);
      });

      it('成功删除应正常返回', async () => {
        const { repository, db } = createRepository({ dialect, softDelete });

        await expect(invoke(repository)).resolves.toBeUndefined();
        expect(softDelete ? db.update : db.delete).toHaveBeenCalledOnce();
      });

      it('未知错误应保留原异常', async () => {
        const error = new Error('测试未知异常');
        const { repository } = createRepository({ dialect, softDelete, error });

        await expect(invoke(repository)).rejects.toBe(error);
      });
    });

    it('单条删除未命中仍应抛出记录不存在', async () => {
      const { repository } = createRepository({
        dialect,
        softDelete,
        affected: 0,
      });

      await expect(repository.delete({ id: 1 })).rejects.toBeInstanceOf(
        RecordNotFoundException,
      );
    });

    it('批量删除部分记录不存在时不应执行写操作', async () => {
      const { repository, db } = createRepository({ dialect, softDelete });

      await expect(
        repository.batchDelete({ ids: [1, 2] }),
      ).rejects.toBeInstanceOf(RecordNotFoundException);
      expect(db.update).not.toHaveBeenCalled();
      expect(db.delete).not.toHaveBeenCalled();
    });
  });
});
