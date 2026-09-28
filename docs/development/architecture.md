# 架构与目录结构

项目面向中小型后端应用：默认 MySQL、Redis 单机，按需选择 PostgreSQL 或 Redis 哨兵。不预置分片、多数据源路由等尚无需求的抽象。

## 主要目录与关键文件

以下是开发导航，不是逐文件清单：根目录列出项目级入口，源码按职责展开，API 子业务以 Demo 展示典型结构。除数据库需要区分两种方言外，基础设施模块统一列到模块目录，内部服务、类型和测试不逐一展开。

省略依赖、构建产物、覆盖率、日志和缓存目录（如 `node_modules/`、`dist/`、`coverage/`），以及 `.git/`、真实 `.env` 和其他本地私有文件。

### 项目根目录

```text
<project-root>/
├── README.md                               # GitHub 项目介绍
├── AGENTS.md                               # 项目入口与简短开发约定
├── package.json                            # 依赖、环境版本、开发与测试命令
├── pnpm-lock.yaml                          # 锁定依赖解析结果
├── pnpm-workspace.yaml                     # pnpm 依赖覆盖与安装脚本许可
├── nest-cli.json                           # Nest CLI、SWC 构建与资源复制
├── tsconfig.json                           # TypeScript 类型检查与路径别名
├── tsconfig.build.json                     # 构建检查范围，排除测试文件
├── .swcrc                                  # SWC 转译、装饰器与模块格式
├── eslint.config.mjs                       # ESLint 代码检查
├── .prettierrc                             # Prettier 格式约定
├── .gitignore                              # Git 忽略规则
├── .dockerignore                           # Docker 构建上下文排除规则
├── .env.example                            # 配置模板；真实 .env 不入库
├── .vscode/settings.json                   # VS Code 工作区格式化与 ESLint 设置
├── .github/workflows/
│   └── ci.yml                              # CI；CD 由实际部署项目按需添加
├── Dockerfile                              # 生产镜像
├── docker-compose.yml                      # 本地数据库 / Redis / SeaweedFS 及管理界面
├── drizzle-mysql.config.ts                 # MySQL 的 Drizzle Kit 配置
├── drizzle-pgsql.config.ts                 # PostgreSQL 的 Drizzle Kit 配置
├── drizzle/                                # 迁移 SQL、快照及迁移记录
│   ├── mysql/                              # MySQL 迁移
│   └── pgsql/                              # PostgreSQL 迁移
├── vitest.config.mts                       # unit / integration / e2e 聚合入口
├── vitest-base.config.mts                  # 共享 SWC、别名和隔离测试环境配置
├── vitest-unit.config.mts                  # 单元测试及覆盖率门槛
├── vitest-integration.config.mts           # 隔离依赖的集成测试
├── vitest-e2e.config.mts                   # 生产镜像端到端测试
├── test/e2e/                               # E2E 测试文件
├── docs/
│   ├── README.md                           # 文档索引
│   ├── getting-started.md                  # 安装、本地运行与调试
│   ├── deployment.md                       # Docker 部署与 GitHub CI/CD
│   ├── backup-and-restore.md               # 备份、恢复与生产数据保护
│   ├── development/                        # 架构、开发规范与测试说明
│   └── modules/                            # 基础设施模块 API、配置与示例
├── scripts/
│   ├── README.md                           # 脚本用法与执行边界
│   ├── bootstrap.sh                        # 在新目录初始化项目
│   ├── new-module.sh                       # 生成 API 子业务骨架
│   ├── setup-github.sh                     # 经授权配置 GitHub 仓库规则
│   └── templates/                          # 业务模块与 Schema 模板
├── reports/                                # 需长期追溯的专项验证记录，不是现行规范
└── src/                                    # 应用源码，见下方展开
```

版本与命令以 [package.json](../../package.json) 为准；文档从 [docs/README.md](../README.md) 查阅，脚本执行条件见 [scripts/README.md](../../scripts/README.md)，历史验证记录的定位见 [reports/README.md](../../reports/README.md)。

### 应用源码

```text
src/
├── main.ts                                 # HTTP 启动、日志、代理、平滑停机
├── __tests__/                              # 开发脚本与测试配置的单元测试
├── app/
│   ├── app.module.ts                       # 根模块装配
│   ├── api/                                # API 业务相关模块及子业务
│   │   ├── api.module.ts                   # 聚合 API 子业务模块
│   │   ├── common/                         # API 业务共享结构，不是通用基础设施
│   │   │   ├── dtos/                       # 共享请求 DTO，如分页参数
│   │   │   └── entities/                   # 共享响应实体
│   │   └── demo/                           # 示例 API 子业务
│   │       ├── demo.module.ts              # 子业务装配
│   │       ├── demo.controller.ts          # 用户端示例路由
│   │       ├── admin-demo.controller.ts    # 管理端示例路由，不代表已有鉴权
│   │       ├── demo.service.ts             # 业务规则与依赖编排
│   │       ├── dtos/                       # 请求、查询及路径参数校验
│   │       ├── entities/                   # 响应字段筛选与转换
│   │       └── __tests__/                  # 子业务单元与集成测试
│   ├── repositories/                       # 业务仓储，如 demo.repository.ts
│   ├── exceptions/                         # 应用校验异常
│   ├── filters/                            # 全局异常映射
│   ├── interceptors/                       # 统一成功响应
│   └── pipes/                              # zod 入参校验及本地化文案
├── common/
│   ├── enums/                              # 通用枚举，如运行环境
│   ├── modules/                            # 基础设施，按模块自身的注册方式使用
│   │   ├── database/                       # 数据库基础设施，不放业务表定义
│   │   │   ├── common/                     # 跨方言仓储异常、接口、类型及工具
│   │   │   ├── constants/                  # 数据库注入 token
│   │   │   ├── interfaces/                 # seed 等基础设施契约
│   │   │   ├── mysql/                      # MySQL 连接、仓储基类、开发/测试用 seed/reset CLI
│   │   │   ├── pgsql/                      # PostgreSQL 对应实现
│   │   │   └── repository.module.ts        # 按业务注册和导出仓储
│   │   ├── cache/                          # Redis 缓存
│   │   ├── distributed-lock/               # Redis 分布式锁
│   │   ├── queue/                          # BullMQ 队列注册与连接配置
│   │   ├── bottleneck/                     # 按需使用的并发与速率限制
│   │   ├── storage/                        # 单 bucket S3 读写与浏览器直传
│   │   ├── logger/                         # Pino 日志
│   │   └── i18n/                           # 国际化装配与语言解析
│   └── utils/                              # 通用工具；以下只展开主要分组与配置入口
│       ├── date-time/                      # 日期、时区与格式转换
│       ├── redis/                          # 单机 / 哨兵连接配置与客户端工厂
│       ├── zod/                            # DTO 和校验辅助工具
│       └── register-env-as-config.ts       # 环境变量校验与配置注册
├── configs/                                # 按模块定义环境变量 schema 与配置映射
├── database/                               # 业务表结构与开发 seed
│   ├── enums/                              # 跨表业务枚举
│   ├── mysql/
│   │   ├── schemas/                        # 表定义及导出入口
│   │   ├── utils/                          # 主键、外键、公开标识和时间列辅助函数
│   │   └── seed.ts                         # 开发演示数据，不是生产基础数据迁移
│   └── pgsql/
│       ├── schemas/                        # PostgreSQL 表定义及导出入口
│       ├── utils/                          # PostgreSQL 列定义辅助函数
│       └── seed.ts                         # PostgreSQL 开发演示数据
└── i18n/                                   # 翻译资源，构建时复制到 dist/i18n/
    ├── en/                                 # 英文文案
    └── zh-cn/                              # 简体中文文案
```

业务模块、基础设施、配置和工具的单元 / 集成测试就近放在各自的 `__tests__/` 中，文件分别使用 `.unit-spec.ts` / `.integration-spec.ts`；目录树只展示代表位置，不表示其他模块没有测试。项目级脚本测试位于 `src/__tests__/`，生产镜像 E2E 位于 `test/e2e/`，完整约定见[测试规范](testing.md)。

数据库相关位置按职责区分：`src/common/modules/database/` 提供连接与仓储基础设施，`src/database/` 定义业务表和开发 seed，`src/app/repositories/` 实现业务查询，根目录 `drizzle/` 保存迁移 SQL 与元数据。新增业务表或查询不要放错层，具体见[数据库开发](database.md)。

## 分层与装配

`api/` 按 API 业务组织，具体子业务放在其下，由 `ApiModule` 聚合装配；它本身不代表一个独立的业务域。

请求依次经过路由与 DTO 校验、Controller、Service、Repository；Controller 不直接操作数据库，Repository 不决定 HTTP 响应。

[AppModule](../../src/app/app.module.ts) 当前装配应用配置、日志、国际化、缓存、MySQL、分布式锁、队列和业务模块，并用 Nest 的 `APP_INTERCEPTOR` / `APP_PIPE` / `APP_FILTER` 注册全局响应、校验与异常处理。

配置依赖通过 `ConfigModule.forFeature(...)` 和 Nest 依赖注入表达，不用 `imports` 的书写先后顺序充当生命周期同步机制。缓存、锁各自管理 Redis 客户端；队列把连接选项交给 BullMQ，由 BullMQ 管理连接。

全局能力不等于每个模块都带 `@Global()`：

- 缓存、数据库、锁已按全局模块注册；日志和国际化通过底层模块提供全局能力，根模块装配一次即可。
- 业务队列仍须在业务模块 `imports` 中调用 `QueueModule.registerQueue(...)` 或 `registerQueueAsync(...)`。
- 业务仓储通过 `RepositoryModule.forFeature(...)` 注册。
- Bottleneck 默认未装配；`BottleneckModule.forRoot()` 默认非全局，确需全局时显式传 `isGlobal: true`。
- Storage 默认未装配且非全局；业务统一导入 `StorageModule`，按需注入它导出的 `StorageService` 或 `UploaderService`。前者处理 S3 读写与签名，后者依赖前者提供直传签发和核验。

模块入口及使用边界见 [基础设施](infra-modules.md)。

## 文件与对象存储边界

应用运行时除日志外不写本地文件；上传、导出和生成文件统一使用 S3 兼容 Storage，以流或受限内存处理，不先落临时文件、不在存储故障时回退本地。数据库保留文件元数据，业务层通过 Storage 能力访问对象；不把本地目录、容器卷或 NAS 作为业务文件存储。

已内置按需使用的 [Storage 模块](../modules/storage.md)：`StorageService` 提供单 bucket 的服务端读写与 PUT 预签名；同模块的 [UploaderService](../modules/storage.md#浏览器直传) 生成随机 key、签发短时防覆盖链接并按业务提供的可信记录核对元数据。文件可由浏览器直接发送到 S3，不经过 Nest 或本地文件系统。模块不提供公开 Controller、认证授权或严格一次性票据，业务层负责归属、配额、状态关联及覆盖策略；客户端不创建 bucket 或配置 CORS。SeaweedFS 的开发数据卷属于独立存储服务，不作为应用文件系统使用。日志、只读资源及开发工具的边界统一见[文件写入与 Storage](engineering-conventions.md#文件写入与-storage)。

## 启动与停机

以 [main.ts](../../src/main.ts) 为准：

- 缓存启动日志，随后由 Pino 接管并刷新日志。默认不额外保留请求原始正文；确有 Webhook 签名验证等需求时，再启用 `rawBody` 并校验请求大小和签名。
- CORS 由 `APP_CORS_*` 控制；生产环境未配置来源，或通配来源配合凭证，默认拒绝启动。只有可信上游实际管理跨域时才显式设置 `APP_CORS_MANAGED_BY_PROXY=true`。
- `APP_TRUST_PROXY` 默认 `false`；仅在真实反向代理环境按实际层数或可信地址开启，避免信任伪造来源。
- `SIGTERM` / `SIGINT` 触发一次 `app.close()`，由模块生命周期关闭资源，并有停机超时兜底。
- 不预置本地静态文件目录或 `/public` 映射。业务文件统一通过 Storage 读写；确需随镜像发布只读静态资源时，须显式配置访问路由与镜像打包，检查公开内容并验证访问，不能将静态目录作为上传或运行时生成文件的目标。

## 构建与资源文件

构建和启动命令统一使用 [package.json](../../package.json) 中的脚本，无需另加 `start:swc` 一类入口。

- `pnpm build` 通过 [nest-cli.json](../../nest-cli.json) 使用 SWC 编译，并启用 TypeScript 类型检查；SWC 编译成功不代表类型检查通过。
- [.swcrc](../../.swcrc) 保留 Nest 所需的装饰器与元数据，生产输出为 CommonJS。类型检查配置见 [tsconfig.json](../../tsconfig.json) 和 [tsconfig.build.json](../../tsconfig.build.json)，后者与 SWC 构建一起排除测试文件。
- 翻译文件从 `src/i18n/` 复制到 `dist/i18n/`；`nest-cli.json` 中的 `assets.include` 相对于 `sourceRoot: "src"`，使用 `i18n/**/*`。调整目录时同步核对 [I18nModule](../../src/common/modules/i18n/i18n.module.ts) 的加载路径。
- `pnpm start:dev` 已通过 `cross-env` 设置 `NODE_ENV=development`，并启用 `--watch --watchAssets`，监听代码与翻译资源。资源监听仅用于开发，不要给一次性生产构建开启常驻监听。
- `pnpm start:dist` 直接运行已有 `dist`，不会重新构建或设置 `NODE_ENV`；生产环境由启动命令或部署平台注入环境变量。

本地启动见[快速开始](../getting-started.md)，上线步骤见[部署说明](../deployment.md)，测试的 SWC 配置见[测试规范](testing.md)。

## 路径别名

TypeScript、SWC 和 Vitest 均使用 `@/*` → `src/*`，分别在 `tsconfig.json`、`.swcrc` 和 [vitest-base.config.mts](../../vitest-base.config.mts) 中配置，修改别名时保持一致。跨目录导入优先 `@/...`，同目录可用相对路径；配置和脚本仍按各自运行环境解析路径。

相关约定：[业务模块](module-development.md) · [接口](rest-api.md) · [配置](env-vars.md) · [测试](testing.md)
