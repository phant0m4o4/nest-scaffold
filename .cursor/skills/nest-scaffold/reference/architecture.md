# 架构与目录结构

## 顶层目录

```
<project-root>/
├── .cursor/                  # Cursor 配置（含本 skill 与 rules）
├── .env / .env.example       # 环境变量（.env 不入库）
├── docker-compose.yml        # MySQL / Redis / phpMyAdmin / phpRedisAdmin
├── drizzle.config.ts         # Drizzle Kit 配置（指向 src/database/schemas）
├── eslint.config.mjs         # ESLint 9 + typescript-eslint + prettier
├── jest.config.ts            # Jest 单测配置
├── jest-e2e.config.ts        # Jest E2E 配置
├── vitest.config.ts          # Vitest 单测配置（带 SWC + path alias）
├── vitest-e2e.config.ts      # Vitest E2E 配置
├── nest-cli.json             # 接入 @nestjs/swagger 插件 + i18n 资产
├── tsconfig.json             # baseUrl=./, paths={"@/*":["src/*"]}, strictNullChecks
├── tsconfig.build.json       # 仅编译 src/
└── src/
```

## src/ 结构

```
src/
├── app/
│   ├── app.module.ts                       # 根模块，统一装配所有 @Global() 基础设施
│   ├── api/
│   │   ├── api.module.ts                   # 业务模块聚合
│   │   ├── common/                         # 跨业务复用 DTO（分页等）/ 共享 Entity
│   │   │   ├── dtos/find-many-by-cursored-pagination.dto.ts
│   │   │   ├── dtos/find-many-by-pagination.dto.ts
│   │   │   └── entities/only-id.entity.ts
│   │   └── <domain>/                       # 单个业务域，自包含
│   │       ├── <domain>.controller.ts
│   │       ├── <domain>.service.ts
│   │       ├── <domain>.module.ts
│   │       ├── dtos/
│   │       ├── entities/
│   │       └── __tests__/
│   ├── interceptors/
│   │   └── global-response.interceptor.ts  # 包装 { statusCode, data?, meta? }
│   └── repositories/
│       ├── repository.module.ts            # forFeature(...) 注册仓储 Provider
│       ├── <domain>.repository.ts          # 继承 BaseRepository
│       └── common/
│           ├── base.repository.ts          # 通用 CRUD + 分页 + 软删除
│           ├── exceptions/                 # RepositoryException 体系
│           ├── interfaces/                 # 分页/排序接口
│           └── utils/mysql-error-mapper.util.ts
├── common/
│   ├── decorators/
│   │   ├── swagger/dto-schema.decorator.ts # 给 DTO 类设置稳定 Swagger 名称
│   │   ├── swagger/responses/              # OkResponse / ArrayOk / Cursored / Created 等
│   │   └── validators/is-id.decorator.ts
│   ├── enums/environment.enum.ts           # development / test / production
│   ├── modules/                            # 全部 @Global() 基础设施模块
│   │   ├── bottleneck/                     # 进程内速率限流
│   │   ├── cache/                          # 基于 RedisService 的缓存
│   │   ├── database/                       # Drizzle MySQL + Tools(init/seed CLI)
│   │   ├── distributed-lock/               # Redlock
│   │   ├── i18n/                           # nestjs-i18n（项目实际不强依赖）
│   │   ├── logger/                         # nestjs-pino + pino-roll
│   │   ├── queue/                          # BullMQ + Bull Board (dev)
│   │   └── redis/                          # ioredis 共享单例（single/sentinel/cluster）
│   └── utils/                              # date-time / hash / random / sleep / register-env-as-config 等
├── configs/                                # registerEnvAsConfig 注册的各模块配置
└── database/
    ├── enums/                              # 跨表枚举
    ├── schemas/                            # Drizzle 表（每张表一个文件）
    ├── schemas/index.ts                    # 聚合 export *
    ├── utils/                              # createPrimaryKeyColumn / createTimestamps / createForeignKeyColumn
    ├── init.ts                             # InitService（pnpm db:init）
    └── seed.ts                             # SeedService（pnpm db:seed）
```

## AppModule 装配顺序

`src/app/app.module.ts` 必须按下列顺序注册（依赖关系决定）：

1. `ConfigModule.forRoot({ cache: true, expandVariables: true, load: [appConfig] })`
2. `LoggerModule.forRoot({ name: 'app' })`
3. `RedisModule`（`@Global()`）
4. `I18nModule` / `CacheModule` / `DatabaseModule` / `DistributedLockModule` / `QueueModule`
5. `ApiModule`（业务聚合）
6. `GlobalResponseInterceptor` 通过 `APP_INTERCEPTOR` Provider 注册

## main.ts 启动要点

- `NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true, cors: { origin: true, credentials: true, ... } })`
- `app.enableShutdownHooks()` —— 必须，否则 `RedisService.onModuleDestroy()` 不会触发，连接不能优雅关闭。
- `app.useLogger(app.get(PinoLogger))` + `app.flushLogs()` —— 接管 Nest 内置 logger。
- `app.set('trust proxy', true)` —— 反代/负载均衡场景下取真实 IP。
- 静态资源：`app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/public' })`。
- 仅在 `NODE_ENV === 'development'` 启用 Swagger（`/api-docs`），生产隐藏。

## 路径别名

- `tsconfig.json` 的 `paths`：`{"@/*": ["src/*"]}`
- Jest 通过 `moduleNameMapper`：`{"^@/(.*)$": "<rootDir>/$1"}`（`rootDir` 是 `src`）
- Vitest 通过 `resolve.alias`：`{ '@': resolve(__dirname, './src') }`

新代码跨目录一律使用 `@/...`，不要使用 `../../../`。

## 模块全局性

下列模块均使用 `@Global()`，在 `AppModule` 注册一次即可全应用注入，**业务模块不要重复 `imports`**：

- `LoggerModule` / `RedisModule` / `I18nModule` / `CacheModule` / `DatabaseModule` / `DistributedLockModule` / `QueueModule`

`QueueModule.registerQueue(...)` / `RepositoryModule.forFeature(...)` 是按业务模块注册的，需要在对应业务 module 的 `imports` 中声明。
