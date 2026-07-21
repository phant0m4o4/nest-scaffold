# 架构与目录结构

## 顶层目录

```
<project-root>/
├── .claude/                  # Claude Code 配置（含本 skill）
├── .env / .env.example       # 环境变量（.env 不入库）
├── .github/workflows/        # CI（lint/build/test/e2e，自动）；CD 不内置，下游项目参考 README「CI / CD」示例自行添加
├── Dockerfile                # 生产镜像（多阶段：SWC 构建 → 仅生产依赖 → node dist/main）
├── docker-compose.yml        # MySQL / PostgreSQL / Redis 及各自管理界面（仅本地开发）
├── drizzle-mysql.config.ts   # Drizzle Kit 配置（MySQL，指向 src/database/mysql/schemas）
├── drizzle-pgsql.config.ts   # Drizzle Kit 配置（PostgreSQL，指向 src/database/pgsql/schemas）
├── eslint.config.mjs         # ESLint 9 + typescript-eslint + prettier
├── vitest.config.ts          # Vitest 单测配置（带 SWC + path alias）
├── vitest-e2e.config.ts      # Vitest E2E 配置
├── nest-cli.json             # SWC builder（typeCheck）+ i18n 资产复制配置
├── .swcrc                    # SWC 编译配置（@/* 别名解析、装饰器元数据）
├── tsconfig.json             # paths={"@/*":["./src/*"]}（无 baseUrl）, strictNullChecks
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
│   ├── exceptions/
│   │   └── zod-validation.exception.ts     # 校验失败异常，自带统一错误信封（含 zod issue code）
│   ├── filters/
│   │   └── global-exception.filter.ts      # 全局异常过滤器：统一 { statusCode, code, message, errors? }，仓储异常映射 404/409/400/503
│   ├── pipes/
│   │   └── i18n-zod-validation.pipe.ts     # 全局 zod 校验管道（消息按请求语言本地化）
│   ├── interceptors/
│   │   └── global-response.interceptor.ts  # 包装 { statusCode, data?, meta? }
│   └── repositories/
│       ├── repository.module.ts            # forFeature(...) 注册仓储 Provider
│       ├── <domain>.repository.ts          # 继承 BaseRepository
│       └── common/
│           ├── mysql/
│           │   ├── base.repository.ts      # 通用 CRUD + 分页 + 软删除（MySQL 方言）
│           │   └── utils/mysql-error-mapper.util.ts
│           ├── pgsql/                      # 与 mysql/ 平行的 PostgreSQL 实现
│           │   ├── base.repository.ts
│           │   └── utils/pgsql-error-mapper.util.ts
│           ├── exceptions/                 # RepositoryException 体系（两方言共享）
│           └── interfaces/                 # 分页/排序接口（两方言共享）
├── common/
│   ├── enums/environment.enum.ts           # development / test / production
│   ├── modules/                            # 全部 @Global() 基础设施模块
│   │   ├── bottleneck/                     # 进程内速率限流
│   │   ├── cache/                          # 基于 RedisService 的缓存
│   │   ├── database/                       # Drizzle MySQL/PostgreSQL 两套平行实现 + Tools(seed/reset CLI)
│   │   ├── distributed-lock/               # Redlock
│   │   ├── i18n/                           # nestjs-i18n（项目实际不强依赖）
│   │   ├── logger/                         # nestjs-pino + pino-roll
│   │   ├── queue/                          # BullMQ + Bull Board (dev)
│   │   └── redis/                          # ioredis 共享单例（single/sentinel/cluster）
│   └── utils/                              # date-time / hash / random / zod / register-env-as-config 等
├── configs/                                # registerEnvAsConfig 注册的各模块配置
└── database/
    ├── enums/                              # 跨表枚举（方言无关，两套 schema 共享）
    ├── mysql/                              # MySQL 业务库（mysql-core）
    │   ├── schemas/                        # Drizzle 表（每张表一个文件）+ index.ts 聚合 export *
    │   ├── utils/                          # createPrimaryKeyColumn / createTimestamps / createForeignKeyColumn
    │   └── seed.ts                         # SeedService（NODE_ENV=development pnpm db:seed:mysql）
    └── pgsql/                              # PostgreSQL 业务库（pg-core，与 mysql/ 平行）
        ├── schemas/                        # 同上（pgTable / pgEnum）
        ├── utils/                          # 同上（bigint identity / $onUpdate）
        └── seed.ts                         # SeedService（NODE_ENV=development pnpm db:seed:pgsql）
```

## AppModule 装配顺序

`src/app/app.module.ts` 必须按下列顺序注册（依赖关系决定）：

1. `ConfigModule.forRoot({ cache: true, expandVariables: true, load: [appConfig] })`
2. `LoggerModule.forRoot({ name: 'app' })`
3. `RedisModule`（`@Global()`）
4. `I18nModule` / `CacheModule` / `DatabaseModule` / `DistributedLockModule` / `QueueModule`
5. `ApiModule`（业务聚合）
6. `GlobalResponseInterceptor` 通过 `APP_INTERCEPTOR` Provider 注册
7. `I18nZodValidationPipe`（`app/pipes/`，基于 zod，校验消息按请求语言本地化）通过 `APP_PIPE` 注册 —— DTO 校验全局生效
8. `GlobalExceptionFilter`（`app/filters/`）通过 `APP_FILTER` 注册 —— 所有异常统一为 `{ statusCode, code, message, errors? }` 信封，仓储异常映射语义化状态码（404/409/400/503），未知异常 500 并记录日志

## main.ts 启动要点

- `NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true, cors: { origin: true, credentials: true, ... } })`
- `app.enableShutdownHooks()` —— 必须，否则 `RedisService.onModuleDestroy()` 不会触发，连接不能优雅关闭。
- `app.useLogger(app.get(PinoLogger))` + `app.flushLogs()` —— 接管 Nest 内置 logger。
- `app.set('trust proxy', true)` —— 反代/负载均衡场景下取真实 IP。
- 静态资源：`app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/public' })`。

## 路径别名

- `tsconfig.json` 的 `paths`：`{"@/*": ["src/*"]}`
- Vitest 通过 `resolve.alias`：`{ '@': resolve(__dirname, './src') }`

新代码跨目录一律使用 `@/...`，不要使用 `../../../`。

## 模块全局性

下列模块均使用 `@Global()`，在 `AppModule` 注册一次即可全应用注入，**业务模块不要重复 `imports`**：

- `LoggerModule` / `RedisModule` / `I18nModule` / `CacheModule` / `DatabaseModule` / `DistributedLockModule` / `QueueModule`

`QueueModule.registerQueue(...)` / `RepositoryModule.forFeature(...)` 是按业务模块注册的，需要在对应业务 module 的 `imports` 中声明。
