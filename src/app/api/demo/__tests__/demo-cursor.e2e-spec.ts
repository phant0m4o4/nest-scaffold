import { AdminDemoController } from '@/app/api/demo/admin-demo.controller';
import { DemoController } from '@/app/api/demo/demo.controller';
import { DemoService } from '@/app/api/demo/demo.service';
import { GlobalExceptionFilter } from '@/app/filters/global-exception.filter';
import { GlobalResponseInterceptor } from '@/app/interceptors/global-response.interceptor';
import { DemoRepository } from '@/app/repositories/demo.repository';
import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import appConfig from '@/configs/app.config';
import * as schema from '@/database/mysql/schemas';
import {
  ArgumentMetadata,
  BadRequestException,
  INestApplication,
  Injectable,
  Module,
  PipeTransform,
  type Type,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
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
import { z } from 'zod';

const TEST_TIMEOUT_MS = 180_000;
const MYSQL_IMAGE = 'mysql:9';
const MYSQL_INNER_PORT = 3306;
const MYSQL_DATABASE = 'cursor_e2e';
const MYSQL_USER = 'root';
const MYSQL_PASSWORD = 'test';
const TEST_MASTER_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

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
  CONSTRAINT \`demos_name_unique\` UNIQUE(\`name\`)
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

/** 集测用：仅校验 createZodDto，不依赖 i18n */
@Injectable()
class TestZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype as
      | (Type<unknown> & { isZodDto?: boolean; schema?: z.ZodType })
      | undefined;
    if (!metatype?.isZodDto || !metatype.schema) {
      return value;
    }
    const parsed = metatype.schema.safeParse(value ?? {});
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败');
    }
    return parsed.data;
  }
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
 * Demo 加密游标 / 页码分页集测（真实 MySQL + HTTP）
 */
describe('Demo cursor pagination (e2e)', () => {
  let mysqlContainer: StartedTestContainer;
  let pool: mysql.Pool;
  let app: INestApplication;

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
    const db = drizzle(pool, { schema, mode: 'default' }) as MySql2Database<
      typeof schema
    >;

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
    class DemoCursorE2eModule {}

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [DemoCursorE2eModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new TestZodValidationPipe());
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
});
