# 测试规范

项目同时支持 **Jest** 和 **Vitest**，两套配置并存。新代码默认按 Jest 写（jest 是 NestJS 默认），需要更快本地反馈时再用 Vitest。

## 文件位置与命名

- 单测：与被测代码同目录的 `__tests__/` 文件夹（双下划线，唯一例外），文件名 `<name>.spec.ts`。
- E2E：同样放 `__tests__/`，文件名 `<name>.e2e-spec.ts`。
- 被测代码：与测试文件路径对应。

## 命令

### Jest

| 命令 | 说明 |
|------|------|
| `pnpm test <文件路径>` | 运行单个文件单测 |
| `pnpm test:watch` | 监听 |
| `pnpm test:cov` | 覆盖率 |
| `pnpm test:debug` | `--inspect-brk` |
| `pnpm test:e2e <文件路径>` | E2E |

Jest 启动时自动设 `NODE_ENV=test`。

### Vitest

| 命令 | 说明 |
|------|------|
| `pnpm vitest <文件路径>` | 单个文件 |
| `pnpm vitest:watch` | 监听 |
| `pnpm vitest:cov` | 覆盖率 |
| `pnpm vitest:debug` | 调试 |
| `pnpm vitest:e2e <文件路径>` | E2E |

Vitest 通过 `vitest.config.ts` 的 `env` 设 `NODE_ENV=test`。

## 风格总则

- 中文测试文案（`describe('用户服务', ...)`、`it('应当返回 ...', ...)`）。
- AAA 模式（Arrange-Act-Assert）。
- 变量命名：`inputX` / `mockX` / `actualX` / `expectedX`。
- E2E 命名遵循 Given-When-Then 心智模型。
- 优先使用官方风格（[NestJS Testing](https://docs.nestjs.com/fundamentals/testing)）。

## 单元测试：useMocker

> 项目约定：单测 **优先用 `useMocker`** 自动给所有未声明的 Provider 提供 mock。

```ts
import { Test } from '@nestjs/testing';

describe('DemoService', () => {
  let demoService: DemoService;
  let mockDemoRepository: Partial<Record<keyof DemoRepository, jest.Mock>>;

  beforeEach(async () => {
    mockDemoRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      // ...
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DemoService],
    })
      .useMocker((token) => {
        if (token === DemoRepository) return mockDemoRepository;
        // 其它依赖给个空 mock
        if (typeof token === 'function') {
          return new (require('jest-mock').ModuleMocker)(global)
            .generateFromMetadata(
              new (require('jest-mock').ModuleMocker)(global).getMetadata(token),
            );
        }
      })
      .compile();
    demoService = moduleRef.get(DemoService);
  });

  it('应当创建一条 demo 并返回 id', async () => {
    const inputBody = { name: 'test', type: 'TYPE_1' };
    const expectedId = 1;
    (mockDemoRepository.create as jest.Mock).mockImplementation(
      async () => await Promise.resolve(expectedId),
    );
    const actualId = await demoService.create(inputBody);
    expect(actualId).toBe(expectedId);
    expect(mockDemoRepository.create).toHaveBeenCalledWith({ data: inputBody });
  });
});
```

**异步 mock 风格固定**：`async () => await Promise.resolve(value)`。

## ConfigService mock

依赖 `ConfigService` 时**不要**用环境变量覆盖，**用 mock**：

```ts
{
  provide: ConfigService,
  useValue: {
    getOrThrow: jest.fn().mockReturnValue({ port: 3000, name: 'test-app' }),
    get: jest.fn(),
  },
}
```

## E2E 测试：overrideProvider + Testcontainers

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MySqlContainer, RedisContainer } from 'testcontainers';
import * as request from 'supertest';

describe('Demo E2E', () => {
  let app: INestApplication;
  let mysqlContainer: StartedMySqlContainer;
  let redisContainer: StartedRedisContainer;

  beforeAll(async () => {
    mysqlContainer = await new MySqlContainer('mysql:8.0').start();
    redisContainer = await new RedisContainer('redis:7-alpine').start();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: (key: string) => {
          // 返回基于 testcontainers 的真实地址/端口
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mysqlContainer.stop();
    await redisContainer.stop();
  });

  it('GET /demo 应返回 200 与游标分页结构', async () => {
    const res = await request(app.getHttpServer()).get('/demo').expect(200);
    expect(res.body).toMatchObject({
      statusCode: 200,
      data: expect.any(Array),
      meta: expect.objectContaining({ nextCursor: expect.anything() }),
    });
  });
});
```

注意：

- E2E 用 **`overrideProvider`** 覆盖配置 / 三方依赖。
- 容器化依赖用 **testcontainers**，测试自启自销，避免污染本地环境。
- 不要在 e2e 里用真实 `.env.development`。

## 已存在的测试参考

- `src/common/modules/redis/__tests__/redis.factory.spec.ts` —— 单测样例
- `src/common/modules/redis/__tests__/redis.module.e2e-spec.ts` —— testcontainers E2E 样例

## 覆盖范围要求

- 每个 Service 的公共方法都要单测。
- 每个 Controller / Module 都要 E2E（至少一条 happy path）。
- 仓储如果只是套 BaseRepository 默认能力，可只测自定义方法（如 `findOneByName`）。
