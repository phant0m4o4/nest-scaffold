import type { ICursorKeysetItem } from '@/common/modules/database/common/repositories/interfaces/cursor-keyset.interface';
import type { PgsqlDatabaseConfigType } from '@/configs/pgsql-database.config';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database.service';
import { BaseRepository } from '../repositories/base.repository';

const POSTGRES_PORT = 5432;
const cursorSchema = pgTable('cursor_type_probe', {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  createdAt: timestamp().notNull(),
});

class CursorProbeRepository extends BaseRepository<typeof cursorSchema> {
  constructor(service: DatabaseService) {
    super(cursorSchema, service.db);
  }
}

const softDeleteSchema = pgTable('soft_delete_alias_probe', {
  id: serial().primaryKey(),
  deletedAt: timestamp('deleted_at'),
});

class SoftDeleteProbeRepository extends BaseRepository<
  typeof softDeleteSchema
> {
  constructor(service: DatabaseService) {
    super(softDeleteSchema, service.db);
  }
}

describe('PostgreSQL 连接池与仓储集成', () => {
  let container: StartedTestContainer | undefined;
  let service: DatabaseService | undefined;
  let control: Client | undefined;
  const controlErrors: Error[] = [];
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  beforeAll(async () => {
    const database = `pool_lifecycle_${randomUUID().replaceAll('-', '')}`;
    const user = 'pool_lifecycle_test';
    const password = 'pool-lifecycle-test-password';
    // 只使用本套件创建的容器、数据库和测试凭据，不加载 .env。
    container = await new GenericContainer('postgres:18')
      .withEnvironment({
        POSTGRES_DB: database,
        POSTGRES_USER: user,
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(POSTGRES_PORT)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .withStartupTimeout(120_000)
      .start();
    const configuration: PgsqlDatabaseConfigType = {
      host: container.getHost(),
      port: container.getMappedPort(POSTGRES_PORT),
      database,
      user,
      password,
    };
    control = new Client({
      ...configuration,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
    });
    control.on('error', (error: Error) => controlErrors.push(error));
    await control.connect();
    service = new DatabaseService(
      new ConfigService({ pgsqlDatabase: configuration }),
      logger as unknown as PinoLogger,
    );
    await service.onModuleInit();
  }, 180_000);

  afterAll(async () => {
    try {
      await service?.onModuleDestroy();
    } finally {
      try {
        await control?.end();
      } finally {
        await container?.stop();
      }
    }
  }, 120_000);

  it('空闲连接被终止后应记录错误并为后续查询重建连接', async () => {
    if (!service || !control) throw new Error('测试资源未初始化');
    const { rows } = await service.db.execute<{ pid: number }>(
      sql`SELECT pg_backend_pid() AS pid`,
    );
    const pid = rows[0].pid;
    expect(pid).toBeGreaterThan(0);
    // 查询完成后连接已归还池；只终止刚取得的本测试服务连接。
    const idle = await control.query<{ state: string }>(
      'SELECT state FROM pg_stat_activity WHERE pid = $1',
      [pid],
    );
    expect(idle.rows[0]?.state).toBe('idle');
    const terminated = await control.query<{ terminated: boolean }>(
      'SELECT pg_terminate_backend($1) AS terminated',
      [pid],
    );
    expect(terminated.rows[0]?.terminated).toBe(true);

    await vi.waitFor(
      () =>
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'db_pool_error' }),
          '数据库 PostgreSQL 空闲连接发生错误',
        ),
      { timeout: 10_000 },
    );
    const recovered = await service.db.execute<{ pid: number; value: number }>(
      sql`SELECT pg_backend_pid() AS pid, 1 AS value`,
    );
    expect(recovered.rows[0].value).toBe(1);
    expect(recovered.rows[0].pid).toBeGreaterThan(0);
    expect(recovered.rows[0].pid).not.toBe(pid);
    expect(controlErrors).toEqual([]);
  });

  it('ISO 字符串与日期游标按升降序翻页应完整且不重复', async () => {
    if (!service) throw new Error('测试资源未初始化');
    await service.db.execute(sql`
      CREATE TABLE cursor_type_probe (
        id serial PRIMARY KEY,
        name varchar(100) NOT NULL,
        "createdAt" timestamp NOT NULL
      )
    `);
    const names = [
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
    ];
    await service.db
      .insert(cursorSchema)
      .values(names.map((name) => ({ name, createdAt: new Date(name) })));
    const repository = new CursorProbeRepository(service);

    for (const column of ['name', 'createdAt']) {
      for (const direction of ['asc', 'desc'] as const) {
        const received: number[] = [];
        let cursor: ICursorKeysetItem[] | undefined;
        for (let page = 0; page < names.length; page++) {
          const result = await repository.findManyWithCursorPagination({
            limit: 1,
            order: [
              { column, direction },
              { column: 'id', direction },
            ],
            cursor,
          });
          expect(result.data).toHaveLength(1);
          received.push(result.data[0].id);
          if (page < names.length - 1) {
            expect(result.meta.nextCursor).not.toBeNull();
          } else {
            expect(result.meta.nextCursor).toBeNull();
          }
          cursor = result.meta.nextCursor ?? undefined;
        }
        expect(received).toEqual(direction === 'asc' ? [1, 2, 3] : [3, 2, 1]);
      }
    }
  });

  it('deletedAt 映射为 deleted_at 时，单条和批量软删除都必须保留物理行', async () => {
    if (!service) throw new Error('测试资源未初始化');
    await service.db.execute(sql`
      CREATE TABLE soft_delete_alias_probe (
        id serial PRIMARY KEY,
        deleted_at timestamp
      )
    `);
    const repository = new SoftDeleteProbeRepository(service);
    const firstId = await repository.create({ data: {} });
    const secondId = await repository.create({ data: {} });
    expect(await repository.findAll()).toHaveLength(2);

    await repository.delete({ id: firstId });
    expect(await repository.findOne({ id: firstId })).toBeNull();
    await repository.batchDelete({ ids: [secondId] });
    expect(await repository.findAll()).toEqual([]);

    const physicalRows = await service.db.select().from(softDeleteSchema);
    expect(physicalRows.map((row) => row.id).sort((a, b) => a - b)).toEqual([
      firstId,
      secondId,
    ]);
    expect(physicalRows.every((row) => row.deletedAt instanceof Date)).toBe(
      true,
    );
  });
});
