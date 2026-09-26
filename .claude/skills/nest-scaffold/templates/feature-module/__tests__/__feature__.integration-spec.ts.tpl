import { AppModule } from '@/app/app.module';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('__Feature__ 集成测试', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // TODO: 用 Testcontainers 启动 MySQL/Redis 容器，覆盖对应配置 Provider，并应用迁移。
    // 本模板自行装配测试应用、覆盖内部配置，属于集成测试；完成上述准备后再运行。
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // 全局 I18nZodValidationPipe 已由 AppModule 注册，无需额外配置
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
