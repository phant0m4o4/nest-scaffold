# 测试规范

项目统一使用 **Vitest**（配合 SWC 编译，`unplugin-swc`，支持装饰器元数据）。Jest 已完全移除。

有风险任务写用例前须先定**覆盖清单**（正常 / 边界 / 失败 / 幂等 / 并发按需取用），测后回对清单标覆盖与缺口；流程见 [task-acceptance.md](task-acceptance.md) 第 1 档。本文只写怎么写测试。

## 文件位置与命名

- 单测：与被测代码同目录的 `__tests__/` 文件夹（双下划线，唯一例外），文件名 `<name>.unit-spec.ts`。
- 集成测试：同样放 `__tests__/`，文件名 `<name>.integration-spec.ts`。
- E2E：放在 `test/e2e/`，文件名 `<name>.e2e-spec.ts`；按项目约定从完整应用公开边界验证。
- 被测代码：与测试文件路径对应。

## 配置文件

- `vitest.config.mts`：默认全量入口，通过 `test.projects` 聚合 unit、integration、e2e 三份专用配置。
- `vitest-base.config.mts`：只共享 SWC 插件、alias `@` → `src`、`NODE_ENV=test` 等基础配置，不包含收集范围、覆盖率阈值或项目列表；测试 API 显式导入。
- `vitest-unit.config.mts`：单测配置，只 include `src/**/*.unit-spec.ts`，独立维护单测覆盖率与阈值。
- `vitest-integration.config.mts`：集成测试配置。include `src/**/*.integration-spec.ts`。
- `vitest-e2e.config.mts`：E2E 配置。include `test/e2e/**/*.e2e-spec.ts`。

## 命令

| 命令 | 说明 |
|------|------|
| `pnpm test <文件路径>` | 全部测试（unit + integration + e2e）；可附文件路径过滤 |
| `pnpm test:unit <文件路径>` | 单元测试（只收集 `*.unit-spec.ts`） |
| `pnpm test:unit:watch` | 单元测试监听 |
| `pnpm test:unit:cov` | 单元测试覆盖率（`--coverage`） |
| `pnpm test:integration <文件路径>` | 集成测试（`--config ./vitest-integration.config.mts`） |
| `pnpm test:e2e <文件路径>` | E2E（`--config ./vitest-e2e.config.mts`） |

三份专用配置均从 `vitest-base.config.mts` 继承 `NODE_ENV=test` 等基础设置；单测覆盖率独立，`pnpm test` 聚合单元、集成和 E2E 测试。集成测试需要 Docker，当前 E2E 入口允许空测试集。


调试单测：优先在 VS Code 的 JavaScript Debug Terminal 里直接跑 `pnpm test:unit <文件路径>`（断点自动生效）；不依赖 IDE 时用 `pnpm exec vitest run --config ./vitest-unit.config.mts --inspect-brk --no-file-parallelism --test-timeout=0 <文件路径>` + Chrome `chrome://inspect`。

## 风格总则

- 中文测试文案（`describe('用户服务', ...)`、`it('应当返回 ...', ...)`）。
- AAA 模式（Arrange-Act-Assert）。
- 变量命名：`inputX` / `mockX` / `actualX` / `expectedX`。
- E2E 命名遵循 Given-When-Then 心智模型。
- 优先使用官方风格（[NestJS Testing](https://docs.nestjs.com/fundamentals/testing)）。
- **显式导入 Vitest API**（不依赖全局注入）：

  ```ts
  import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';
  ```

- mock API 对照：`jest.fn/mock/clearAllMocks` → `vi.fn/mock/clearAllMocks`；类型 `jest.Mock` → `Mock`、`jest.Mocked<T>` → `Mocked<T>`（均从 `vitest` 导入）。

## 单元测试：useMocker

> 项目约定：单测 **优先用 `useMocker`** 自动给所有未声明的 Provider 提供 mock。

```ts
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

describe('DemoService', () => {
  let demoService: DemoService;
  let mockDemoRepository: Partial<Record<keyof DemoRepository, Mock>>;

  beforeEach(async () => {
    mockDemoRepository = {
      create: vi.fn(),
      findOne: vi.fn(),
      // ...
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DemoService],
    })
      .useMocker((token) => {
        if (token === DemoRepository) return mockDemoRepository;
        // 其它依赖给个空 mock
        return {};
      })
      .compile();
    demoService = moduleRef.get(DemoService);
  });

  it('应当创建一条 demo 并返回 id', async () => {
    const inputBody = { name: 'test', type: 'TYPE_1' };
    const expectedId = 1;
    (mockDemoRepository.create as Mock).mockImplementation(
      async () => await Promise.resolve(expectedId),
    );
    const actualId = await demoService.create(inputBody);
    expect(actualId).toBe(expectedId);
    expect(mockDemoRepository.create).toHaveBeenCalledWith({ data: inputBody });
  });
});
```

**异步 mock 风格固定**：`async () => await Promise.resolve(value)`。

## 模块 mock：vi.mock 提升注意事项

`vi.mock` 的工厂函数会被**提升到文件顶部**执行，因此：

1. 工厂内**不能引用文件顶层变量**；需要跨作用域共享的状态用 `vi.hoisted()` 声明。
2. 工厂内需要的类可放独立文件，在工厂内 `await import()` 引入。
3. mock 构造函数时实现必须用**普通 `function`**（可被 `new` 调用），不能用箭头函数。

参考 `src/common/utils/redis/__tests__/redis.factory.unit-spec.ts` 的实际写法：

```ts
const { redisInstances } = vi.hoisted(() => ({
  redisInstances: [] as unknown[],
}));

vi.mock('ioredis', async () => {
  const { MockRedisClient } = await import('./support/mock-redis-client');
  // 注意：实现必须是普通 function（可被 new 调用），箭头函数不可作为构造函数
  return {
    Redis: vi.fn(function (...args: unknown[]) {
      const instance = new MockRedisClient(args);
      redisInstances.push(instance);
      return instance;
    }),
  };
});
```

## ConfigService mock

依赖 `ConfigService` 时**不要**用环境变量覆盖，**用 mock**：

```ts
{
  provide: ConfigService,
  useValue: {
    getOrThrow: vi.fn().mockReturnValue({ port: 3000, name: 'test-app' }),
    get: vi.fn(),
  },
}
```

## 集成测试：overrideProvider + Testcontainers

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MySqlContainer, RedisContainer } from 'testcontainers';
import * as request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Demo integration', () => {
  let app: INestApplication;
  let mysqlContainer: StartedMySqlContainer;
  let redisContainer: StartedRedisContainer;

  beforeAll(async () => {
    mysqlContainer = await new MySqlContainer('mysql:9').start();
    redisContainer = await new RedisContainer('redis:8-alpine').start();

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
    expect(res.body.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // nextCursor 为加密字符串或 null（勿断言为数字 id）
    const { nextCursor } = res.body.meta;
    expect(nextCursor === null || typeof nextCursor === 'string').toBe(true);
  });
});
```

注意：

- 集成测试可用 **`overrideProvider`** 覆盖配置 / 三方依赖；须提供合法 `APP_MASTER_KEY`（或 mock `appConfig`）。
- 容器化依赖用 **testcontainers**，测试自启自销，避免污染本地环境。
- 不要在测试里用真实 `.env.development`。
- 使用 Testcontainers 本身不决定测试层级；本项目 E2E 要求完整应用装配、通过公开接口验证，不替换内部 Provider/Pipe/Filter/配置。当前预留 E2E 入口。

## 已存在的测试参考

- `src/common/utils/redis/__tests__/redis.factory.unit-spec.ts` —— 单测样例（含 `vi.hoisted` + `vi.mock` 构造函数 mock）
- `src/common/utils/redis/__tests__/redis-factory.integration-spec.ts` —— Testcontainers Redis 集成测试样例
- `src/app/api/demo/__tests__/demo.service.unit-spec.ts` —— 加密游标 Service 单测
- `src/common/modules/database/mysql/repositories/__tests__/base.repository.cursor.unit-spec.ts` —— 多列 keyset 仓储单测
- `src/app/api/demo/__tests__/demo-cursor.integration-spec.ts` —— MySQL Testcontainers 游标/页码集测

## 覆盖范围要求

- 每个 Service 的公共方法都要单测。
- 每个 Controller / Module 都要 E2E（至少一条 happy path）。
- 仓储如果只是套 BaseRepository 默认能力，可只测自定义方法（如 `findOneByName`）。
