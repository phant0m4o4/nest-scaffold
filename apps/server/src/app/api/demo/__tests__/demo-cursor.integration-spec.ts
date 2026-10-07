import { AdminDemoController } from '@/app/api/demo/admin-demo.controller';
import { DemoController } from '@/app/api/demo/demo.controller';
import { DemoService } from '@/app/api/demo/demo.service';
import { GlobalExceptionFilter } from '@/app/filters/global-exception.filter';
import { GlobalResponseInterceptor } from '@/app/interceptors/global-response.interceptor';
import { I18nZodValidationPipe } from '@/app/pipes/i18n-zod-validation.pipe';
import { DemoRepository } from '@/app/repositories/demo.repository';
import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import { BaseRepository } from '@/common/modules/database/mysql/repositories/base.repository';
import { ForeignKeyConstraintViolationException } from '@/common/modules/database/common/repositories/exceptions/foreign-key-constraint-violation-exception';
import appConfig from '@/configs/app.config';
import * as schema from '@/database/mysql/schemas';
import {
  adminDemoSchema,
  apiErrorSchema,
  publicDemoSchema,
} from '@nest-scaffold/contracts';
import { INestApplication, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { mysqlTable, serial, timestamp } from 'drizzle-orm/mysql-core';
import type { Server } from 'node:http';
import { getLoggerToken, type PinoLogger } from 'nestjs-pino';
import * as mysql from 'mysql2/promise';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const TEST_TIMEOUT_MS = 180_000;
const MYSQL_IMAGE = 'mysql:9';
const MYSQL_INNER_PORT = 3306;
const MYSQL_DATABASE = 'cursor_integration';
const MYSQL_USER = 'root';
const MYSQL_PASSWORD = 'test';
const TEST_MASTER_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

const softDeleteSchema = mysqlTable('soft_delete_alias_probe', {
  id: serial().primaryKey(),
  deletedAt: timestamp('deleted_at'),
});

class SoftDeleteProbeRepository extends BaseRepository<
  typeof softDeleteSchema
> {
  constructor(db: MySql2Database<typeof schema>) {
    super(softDeleteSchema, db);
  }
}

const CREATE_DEMOS_SQL = `
CREATE TABLE \`demos\` (
  \`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
  \`publicId\` varchar(21) NOT NULL,
  \`shortPublicId\` varchar(8) NOT NULL,
  \`name\` varchar(100) NOT NULL,
  \`type\` enum('TYPE_1','TYPE_2','TYPE_3') NOT NULL DEFAULT 'TYPE_1',
  \`parentId\` bigint unsigned,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`demos_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`demos_publicId_unique\` UNIQUE(\`publicId\`),
  CONSTRAINT \`demos_shortPublicId_unique\` UNIQUE(\`shortPublicId\`),
  CONSTRAINT \`demos_name_unique\` UNIQUE(\`name\`),
  CONSTRAINT \`parent_id_fk\` FOREIGN KEY (\`parentId\`) REFERENCES \`demos\`(\`id\`)
);
`;

type CursorListBody = {
  statusCode: number;
  data: Array<{ publicId: string; name: string; id?: number }>;
  meta: { nextCursor: string | null };
};

type PageListBody = {
  statusCode: number;
  data: unknown[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
};

function asCursorBody(res: Response): CursorListBody {
  return res.body as CursorListBody;
}

function asPageBody(res: Response): PageListBody {
  return res.body as PageListBody;
}

function buildLoggerStub(): PinoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as PinoLogger;
}

/**
 * Demo 模块集成测试（真实 MySQL + 内进程 Nest HTTP 适配器）。
 * 自行装配测试模块并注入隔离配置；复用真实验证、响应及错误处理链路。
 * 不加载完整应用，因此不属于完整应用 E2E。
 */
describe('Demo CRUD 与分页集成测试', () => {
  let mysqlContainer: StartedTestContainer;
  let pool: mysql.Pool;
  let app: INestApplication;
  let repository: DemoRepository;
  let db: MySql2Database<typeof schema>;

  beforeAll(async () => {
    mysqlContainer = await new GenericContainer(MYSQL_IMAGE)
      .withEnvironment({
        MYSQL_ROOT_PASSWORD: MYSQL_PASSWORD,
        MYSQL_DATABASE,
      })
      .withExposedPorts(MYSQL_INNER_PORT)
      .withWaitStrategy(
        Wait.forLogMessage(/ready for connections/).withStartupTimeout(
          TEST_TIMEOUT_MS,
        ),
      )
      .start();

    const host = mysqlContainer.getHost();
    const port = mysqlContainer.getMappedPort(MYSQL_INNER_PORT);

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        pool = mysql.createPool({
          host,
          port,
          user: MYSQL_USER,
          password: MYSQL_PASSWORD,
          database: MYSQL_DATABASE,
          connectionLimit: 5,
        });
        await pool.query('SELECT 1');
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (lastError) {
      throw lastError;
    }

    await pool.query(CREATE_DEMOS_SQL);
    db = drizzle(pool, { schema, mode: 'default' });

    @Module({
      controllers: [DemoController, AdminDemoController],
      providers: [
        DemoService,
        DemoRepository,
        { provide: DatabaseService, useValue: { db } },
        { provide: appConfig.KEY, useValue: { masterKey: TEST_MASTER_KEY } },
        {
          provide: getLoggerToken(DemoRepository.name),
          useValue: buildLoggerStub(),
        },
      ],
    })
    class DemoCursorIntegrationModule {}

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [DemoCursorIntegrationModule],
    }).compile();

    app = moduleRef.createNestApplication();
    repository = moduleRef.get(DemoRepository);
    app.useGlobalPipes(new I18nZodValidationPipe());
    app.useGlobalInterceptors(new GlobalResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter(buildLoggerStub()));
    await app.init();

    const server = app.getHttpServer() as Server;
    for (let index = 1; index <= 5; index++) {
      await request(server)
        .post('/demo')
        .send({ name: `cursor-item-${index}`, type: 'TYPE_1' })
        .expect(201);
    }
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
    if (mysqlContainer) {
      await mysqlContainer.stop();
    }
  }, TEST_TIMEOUT_MS);

  it('GET /demo 第一页应返回加密 nextCursor', async () => {
    const server = app.getHttpServer() as Server;
    const res = await request(server)
      .get('/demo')
      .query({ limit: 2, order: 'id:asc' })
      .expect(200);

    const body = asCursorBody(res);
    expect(body.statusCode).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(typeof body.meta.nextCursor).toBe('string');
    expect(body.meta.nextCursor!.split('.')).toHaveLength(3);
    expect(body.data[0]).not.toHaveProperty('id');
    expect(body.data[0]).toHaveProperty('publicId');
  });

  it('携带 nextCursor 应能翻到下一页且不重复', async () => {
    const server = app.getHttpServer() as Server;
    const first = asCursorBody(
      await request(server)
        .get('/demo')
        .query({ limit: 2, order: 'id:asc' })
        .expect(200),
    );
    const second = asCursorBody(
      await request(server)
        .get('/demo')
        .query({
          limit: 2,
          order: 'id:asc',
          cursor: first.meta.nextCursor ?? undefined,
        })
        .expect(200),
    );

    const firstIds = first.data.map((row) => row.publicId);
    const secondIds = second.data.map((row) => row.publicId);
    expect(secondIds).toHaveLength(2);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it('改筛选后复用旧 cursor 应 400', async () => {
    const server = app.getHttpServer() as Server;
    const first = asCursorBody(
      await request(server)
        .get('/demo')
        .query({ limit: 2, order: 'id:asc' })
        .expect(200),
    );

    await request(server)
      .get('/demo')
      .query({
        limit: 2,
        order: 'id:asc',
        name: 'cursor-item-1',
        cursor: first.meta.nextCursor ?? undefined,
      })
      .expect(400);
  });

  it('用户端 cursor 拿到管理端应 400', async () => {
    const server = app.getHttpServer() as Server;
    const userPage = asCursorBody(
      await request(server)
        .get('/demo')
        .query({ limit: 2, order: 'id:asc' })
        .expect(200),
    );

    await request(server)
      .get('/admin/demo')
      .query({
        limit: 2,
        order: 'id:asc',
        cursor: userPage.meta.nextCursor ?? undefined,
      })
      .expect(400);
  });

  it('真正空串可沿用未筛选游标，空白字符串筛选必须使用独立游标', async () => {
    const server = app.getHttpServer() as Server;
    const first = asCursorBody(
      await request(server)
        .get('/demo')
        .query({ limit: 2, order: 'id:asc' })
        .expect(200),
    );
    expect(first.meta.nextCursor).not.toBeNull();
    await request(server)
      .get('/demo')
      .query({
        limit: 2,
        order: 'id:asc',
        name: '',
        cursor: first.meta.nextCursor,
      })
      .expect(200);
    await request(server)
      .get('/demo')
      .query({
        limit: 2,
        order: 'id:asc',
        name: '   ',
        cursor: first.meta.nextCursor,
      })
      .expect(400);
  });

  it('改 order 后复用旧 cursor 应 400', async () => {
    const server = app.getHttpServer() as Server;
    const first = asCursorBody(
      await request(server)
        .get('/demo')
        .query({ limit: 2, order: 'id:asc' })
        .expect(200),
    );

    await request(server)
      .get('/demo')
      .query({
        limit: 2,
        order: 'id:desc',
        cursor: first.meta.nextCursor ?? undefined,
      })
      .expect(400);
  });

  it('GET /demo/by-page 应返回页码分页 meta', async () => {
    const server = app.getHttpServer() as Server;
    const body = asPageBody(
      await request(server)
        .get('/demo/by-page')
        .query({ page: 1, pageSize: 2 })
        .expect(200),
    );

    expect(body.data).toHaveLength(2);
    expect(body.meta).toMatchObject({
      page: 1,
      pageSize: 2,
      hasNextPage: true,
    });
    expect(typeof body.meta.total).toBe('number');
  });

  it('管理端游标页可暴露 id', async () => {
    const server = app.getHttpServer() as Server;
    const body = asCursorBody(
      await request(server)
        .get('/admin/demo')
        .query({ limit: 2, order: 'id:asc' })
        .expect(200),
    );

    expect(body.data[0]).toHaveProperty('id');
    expect(typeof body.meta.nextCursor).toBe('string');
  });

  it('多列 order=createdAt:desc,id:desc 应能翻页', async () => {
    const server = app.getHttpServer() as Server;
    const order = 'createdAt:desc,id:desc';
    const first = asCursorBody(
      await request(server).get('/demo').query({ limit: 2, order }).expect(200),
    );
    expect(first.data).toHaveLength(2);
    expect(typeof first.meta.nextCursor).toBe('string');

    const second = asCursorBody(
      await request(server)
        .get('/demo')
        .query({
          limit: 2,
          order,
          cursor: first.meta.nextCursor ?? undefined,
        })
        .expect(200),
    );
    const firstIds = first.data.map((row) => row.publicId);
    const secondIds = second.data.map((row) => row.publicId);
    expect(secondIds.length).toBeGreaterThan(0);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it('ISO 日期格式的名称按升降序翻页均不应重复或漏项', async () => {
    const server = app.getHttpServer() as Server;
    const names = [
      '2026-09-01T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
      '2026-09-03T00:00:00.000Z',
    ];
    for (const name of names) {
      await repository.create({ data: { name, type: 'TYPE_2' } });
    }

    for (const direction of ['asc', 'desc']) {
      const received: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < names.length; page++) {
        const body = asCursorBody(
          await request(server)
            .get('/demo')
            .query({
              limit: 1,
              type: 'TYPE_2',
              order: `name:${direction},id:${direction}`,
              cursor,
            })
            .expect(200),
        );
        expect(body.data).toHaveLength(1);
        received.push(body.data[0].name);
        if (page < names.length - 1) {
          expect(typeof body.meta.nextCursor).toBe('string');
        } else {
          expect(body.meta.nextCursor).toBeNull();
        }
        cursor = body.meta.nextCursor ?? undefined;
      }
      expect(received).toEqual(
        direction === 'asc' ? names : [...names].reverse(),
      );
    }
  });

  it.each(['/demo', '/admin/demo'])(
    '%s 可空游标排序应始终返回 400',
    async (route) => {
      const server = app.getHttpServer() as Server;
      for (const limit of [1, 100]) {
        await request(server)
          .get(route)
          .query({ limit, order: 'parentId:asc,id:asc' })
          .expect(400);
      }
    },
  );

  it('页码分页仍应支持可空列排序', async () => {
    const server = app.getHttpServer() as Server;
    const body = asPageBody(
      await request(server)
        .get('/demo/by-page')
        .query({ pageSize: 2, orderColumn: 'parentId' })
        .expect(200),
    );

    expect(body.data).toHaveLength(2);
  });

  it('管理端创建、详情、修改和删除应完整联通用户端只读详情', async () => {
    const server = app.getHttpServer() as Server;
    const created = await request(server)
      .post('/admin/demo')
      .send({ name: '  crud-item  ', type: 'TYPE_1', parentId: null })
      .expect(201);
    const id = (created.body as { data: { id: number } }).data.id;
    expect(created.body).toEqual({ statusCode: 201, data: { id } });
    expect(id).toBeGreaterThan(0);

    const detail = await request(server).get(`/admin/demo/${id}`).expect(200);
    const row = adminDemoSchema.parse((detail.body as { data: unknown }).data);
    expect(row).toMatchObject({ id, name: 'crud-item', parentId: null });

    const updated = await request(server)
      .patch(`/admin/demo/${id}`)
      .send({ name: '  crud-item-updated  ', type: 'TYPE_3' })
      .expect(200);
    expect(updated.body).toEqual({ statusCode: 200 });
    // 未改变字段也属于成功更新，不能误报记录不存在。
    await request(server)
      .patch(`/admin/demo/${id}`)
      .send({ name: 'crud-item-updated', type: 'TYPE_3' })
      .expect(200);

    const publicDetail = await request(server)
      .get(`/demo/${row.publicId}`)
      .expect(200);
    const publicData: unknown = (publicDetail.body as { data: unknown }).data;
    expect(publicDemoSchema.parse(publicData)).toEqual(publicData);
    expect(publicData).toMatchObject({
      publicId: row.publicId,
      name: 'crud-item-updated',
      type: 'TYPE_3',
    });
    expect(publicData).not.toHaveProperty('id');
    expect(publicData).not.toHaveProperty('parentId');

    const list = await request(server)
      .get('/demo/by-page')
      .query({ name: 'crud-item-updated', type: 'TYPE_3' })
      .expect(200);
    expect(asPageBody(list).data).toEqual([publicData]);

    const removed = await request(server)
      .delete(`/admin/demo/${id}`)
      .expect(200);
    expect(removed.body).toEqual({ statusCode: 200 });
    for (const path of [`/admin/demo/${id}`, `/demo/${row.publicId}`]) {
      const missing = await request(server).get(path).expect(200);
      expect(missing.body).toEqual({ statusCode: 200, data: null });
      const updateMissing = await request(server)
        .patch(path)
        .send({ name: 'missing-update' })
        .expect(404);
      expect(updateMissing.body).toMatchObject({ code: 'RECORD_NOT_FOUND' });
      const deleteMissing = await request(server).delete(path).expect(404);
      expect(deleteMissing.body).toMatchObject({ code: 'RECORD_NOT_FOUND' });
    }
  });

  it.each([
    { name: '', type: 'TYPE_1' },
    { name: '   ', type: 'TYPE_1' },
    { name: 'a'.repeat(101), type: 'TYPE_1' },
    { name: 'invalid-type', type: 'TYPE_4' },
    { name: 'invalid-parent', type: 'TYPE_1', parentId: 0 },
    { name: 'invalid-parent', type: 'TYPE_1', parentId: -1 },
    { name: 'invalid-parent', type: 'TYPE_1', parentId: 1.5 },
    {
      name: 'invalid-parent',
      type: 'TYPE_1',
      parentId: Number.MAX_SAFE_INTEGER + 1,
    },
  ])('创建与更新无效字段 %j 应返回统一 422 字段错误', async (body) => {
    const server = app.getHttpServer() as Server;
    for (const response of [
      await request(server).post('/admin/demo').send(body).expect(422),
      await request(server).patch('/admin/demo/1').send(body).expect(422),
    ]) {
      const envelope = apiErrorSchema.parse(response.body);
      expect(envelope).toMatchObject({
        statusCode: 422,
        code: 'VALIDATION_FAILED',
      });
      expect(envelope.errors?.length).toBeGreaterThan(0);
      expect(
        envelope.errors?.every((error) =>
          ['name', 'type', 'parentId'].includes(error.field),
        ),
      ).toBe(true);
    }
  });

  it.each([{}, { unrelated: 'value' }])(
    '更新没有任何有效字段 %j 应返回 422',
    async (body) => {
      await request(app.getHttpServer() as Server)
        .patch('/admin/demo/1')
        .send(body)
        .expect(422);
    },
  );

  it('重复名称创建或修改应返回 409 且保留原值', async () => {
    const server = app.getHttpServer() as Server;
    const first = await repository.create({
      data: { name: 'unique-first', type: 'TYPE_1' },
    });
    const second = await repository.create({
      data: { name: 'unique-second', type: 'TYPE_2' },
    });
    for (const response of [
      await request(server)
        .post('/admin/demo')
        .send({ name: '  unique-first  ', type: 'TYPE_1' })
        .expect(409),
      await request(server)
        .patch(`/admin/demo/${second.id}`)
        .send({ name: 'unique-first' })
        .expect(409),
    ]) {
      expect(response.body).toMatchObject({ code: 'RECORD_ALREADY_EXISTS' });
    }
    expect(await repository.findOne({ id: second.id })).toMatchObject({
      name: 'unique-second',
    });
    await repository.delete({ id: first.id });
    await repository.delete({ id: second.id });
  });

  it('不存在的父级与自身关联应拒绝，清空关联后可以删除父级', async () => {
    const server = app.getHttpServer() as Server;
    const parent = await repository.create({
      data: { name: 'nullable-parent', type: 'TYPE_1' },
    });
    const created = await request(server)
      .post('/admin/demo')
      .send({ name: 'nullable-child', type: 'TYPE_2', parentId: parent.id })
      .expect(201);
    const childId = (created.body as { data: { id: number } }).data.id;
    const child = await repository.findOne({ id: childId });
    expect(child).toMatchObject({ parentId: parent.id });

    for (const response of [
      await request(server)
        .post('/admin/demo')
        .send({ name: 'missing-parent', type: 'TYPE_1', parentId: 999_999 })
        .expect(409),
      await request(server)
        .patch(`/admin/demo/${childId}`)
        .send({ parentId: 999_999 })
        .expect(409),
    ]) {
      expect(response.body).toMatchObject({
        code: 'FOREIGN_KEY_CONSTRAINT_VIOLATION',
      });
    }
    for (const path of [`/admin/demo/${childId}`, `/demo/${child!.publicId}`]) {
      const response = await request(server)
        .patch(path)
        .send({ parentId: childId })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(await repository.findOne({ id: childId })).toMatchObject({
      parentId: parent.id,
    });

    await request(server)
      .patch(`/admin/demo/${childId}`)
      .send({ parentId: null })
      .expect(200);
    expect(await repository.findOne({ id: childId })).toMatchObject({
      parentId: null,
    });
    await request(server).delete(`/admin/demo/${parent.id}`).expect(200);
    await request(server).delete(`/admin/demo/${childId}`).expect(200);
  });

  it('删除被引用的父记录应返回 409，批量删除也应映射外键异常并保留数据', async () => {
    const server = app.getHttpServer() as Server;
    const parent = await repository.create({
      data: { name: 'fk-parent', type: 'TYPE_1' },
    });
    const child = await repository.create({
      data: { name: 'fk-child', type: 'TYPE_1', parentId: parent.id },
    });

    const response = await request(server)
      .delete(`/admin/demo/${parent.id}`)
      .expect(409);
    expect(response.body).toMatchObject({
      statusCode: 409,
      code: 'FOREIGN_KEY_CONSTRAINT_VIOLATION',
    });
    await expect(
      repository.batchDelete({ ids: [parent.id] }),
    ).rejects.toBeInstanceOf(ForeignKeyConstraintViolationException);
    expect(await repository.findOne({ id: parent.id })).not.toBeNull();
    expect(await repository.findOne({ id: child.id })).not.toBeNull();

    await request(server).delete(`/admin/demo/${child.id}`).expect(200);
    await request(server).delete(`/admin/demo/${parent.id}`).expect(200);
  });

  it('deletedAt 映射为 deleted_at 时，单条和批量软删除都必须保留物理行', async () => {
    await pool.query(`
      CREATE TABLE soft_delete_alias_probe (
        id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
        deleted_at timestamp NULL
      )
    `);
    const softRepository = new SoftDeleteProbeRepository(db);
    const firstId = await softRepository.create({ data: {} });
    const secondId = await softRepository.create({ data: {} });
    expect(await softRepository.findAll()).toHaveLength(2);

    await softRepository.delete({ id: firstId });
    expect(await softRepository.findOne({ id: firstId })).toBeNull();
    await softRepository.batchDelete({ ids: [secondId] });
    expect(await softRepository.findAll()).toEqual([]);

    const physicalRows = await db.select().from(softDeleteSchema);
    expect(physicalRows.map((row) => row.id).sort((a, b) => a - b)).toEqual([
      firstId,
      secondId,
    ]);
    expect(physicalRows.every((row) => row.deletedAt instanceof Date)).toBe(
      true,
    );
  });
});
