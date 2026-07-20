import { AppModule } from '@/app/app.module';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('__Feature__ E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // TODO: 用 testcontainers 启动 mysql/redis 容器，并通过 overrideProvider(ConfigService) 注入容器地址
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // 全局 I18nZodValidationPipe / ZodValidationExceptionFilter 已由 AppModule 注册，无需额外配置
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /__features__ 应当返回游标分页结构', async () => {
    const res = await request(app.getHttpServer())
      .get('/__features__')
      .expect(200);

    expect(res.body).toMatchObject({
      statusCode: 200,
      data: expect.any(Array),
    });
  });
});
