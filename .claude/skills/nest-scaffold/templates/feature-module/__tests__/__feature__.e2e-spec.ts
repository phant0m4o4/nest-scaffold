import { AppModule } from '@/app/app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

describe('__Feature__ E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // TODO: 用 testcontainers 启动 mysql/redis 容器，并通过 overrideProvider(ConfigService) 注入容器地址
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
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
