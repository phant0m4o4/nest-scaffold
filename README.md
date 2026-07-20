# Nest Scaffold

基于 NestJS 的后端脚手架项目，集成 Drizzle ORM、BullMQ、Redis、Pino 日志等常用能力。

## 技术栈

- **框架**：NestJS 11
- **语言**：TypeScript 5
- **ORM**：Drizzle ORM（MySQL / PostgreSQL 双实现，默认装配 MySQL）
- **缓存/队列**：Redis（ioredis）+ BullMQ
- **日志**：nestjs-pino + pino-pretty + pino-roll
- **校验**：zod（项目内轻量 createZodDto 工厂，无框架桥接依赖）
- **测试**：Vitest（SWC）+ Supertest + Testcontainers
- **代码规范**：ESLint + Prettier + Commitizen

## 环境要求

- Node.js >= 22
- pnpm >= 10
- Docker & Docker Compose（用于 MySQL、PostgreSQL、Redis 等基础设施）

## 快速开始（开发环境）

> 本章节面向本地开发。生产环境部署见下文「[生产环境部署](#生产环境部署)」。

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动基础设施

`docker-compose.yml` 仅用于本地开发（含管理界面、弱密码默认值）；生产环境应使用独立部署或托管的数据库与 Redis。

```bash
docker compose up -d
```

会启动以下服务：

| 服务          | 端口 | 说明                |
| ------------- | ---- | ------------------- |
| MySQL 8.0     | 3306 | 数据库（默认）      |
| PostgreSQL 16 | 5432 | 数据库（可选）      |
| phpMyAdmin    | 8080 | MySQL 管理界面      |
| pgAdmin       | 8082 | PostgreSQL 管理界面 |
| Redis         | 6379 | 缓存/队列           |
| phpRedisAdmin | 8081 | Redis 管理界面      |

### 3. 配置环境变量

复制 `.env.example` 为 `.env`。`.env` 面向本地开发，默认值与上一步 docker-compose 启动的服务一一对应，通常不改即可跑通。`NODE_ENV` 不写入 `.env`，由命令调用方传入（`start:dev` 已内置 `development`）：

```env
APP_NAME=nest-scaffold
APP_PORT=3000

# MySQL
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=${APP_NAME}
MYSQL_USER=root
MYSQL_PASSWORD=root_password

# PostgreSQL（与 MySQL 平行的可选数据源，按需使用）
PGSQL_HOST=127.0.0.1
PGSQL_PORT=5432
PGSQL_DATABASE=${APP_NAME}
PGSQL_USER=postgres
PGSQL_PASSWORD=root_password

# Redis（全应用共享连接，Cache / DistributedLock 基于此；Queue 独立配置见下）
REDIS_MODE=single
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis_password
REDIS_DB=0

# Log
LOG_FILE_ENABLE=true
LOG_FILE_PATH=./logs/app.log

# Cache
CACHE_TTL_SECONDS=604800 # 7 days
CACHE_KEY_PREFIX=cache

# Distributed Lock
DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock

# Queue（BullMQ 需独享连接，默认复用全局 Redis，可按需指向独立实例/DB）
QUEUE_REDIS_HOST=${REDIS_HOST}
QUEUE_REDIS_PORT=${REDIS_PORT}
QUEUE_REDIS_PASSWORD=${REDIS_PASSWORD}
QUEUE_REDIS_DB=0
QUEUE_KEY_PREFIX=queue
QUEUE_DASHBOARD_ROUTE=/queues
```

### 4. 初始化数据库

```bash
# 推送表结构到数据库（push 仅限开发环境；生产环境走 migration，见「生产环境部署」）
pnpm db:push:mysql

# 初始化基础数据
NODE_ENV=development pnpm db:init:mysql

# 填充种子数据
NODE_ENV=development pnpm db:seed:mysql
```

> `db:init:mysql` / `db:seed:mysql` 不内置环境，`NODE_ENV` 由调用方传入（Windows PowerShell 用 `$env:NODE_ENV="development"; pnpm db:init:mysql`）。

### 5. 启动开发服务

```bash
pnpm start:dev
```

## 生产环境部署

与开发环境的关键差异：基础设施独立部署（不使用本仓库的 docker-compose）、`NODE_ENV=production`、表结构变更只走 migration、不填充 seed 演示数据。

### 1. 配置环境变量

生产环境的变量建议由部署平台（K8s / systemd / PaaS 等）注入，或使用独立维护的 `.env`（不入库）。与开发环境的差异项：

- 数据库 / Redis 指向生产实例，使用强密码（`.env.example` 里的默认值仅供本地开发）；
- `NODE_ENV=production` 由启动命令或平台注入，不写入 `.env`；
- 按需调整 `LOG_FILE_*`、`QUEUE_*`、`CACHE_*` 等。

### 2. 安装依赖与构建

```bash
pnpm install
pnpm build
```

### 3. 数据库

```bash
# 表结构变更一律走 migration，禁止 db:push（push 直接同步表结构，
# 可能隐式删表删列且无法回滚；迁移文件在开发期用 db:generate:mysql 生成并随代码入库）
pnpm db:migrate:mysql

# 初始化基础数据
NODE_ENV=production pnpm db:init:mysql
```

> seed 填充的是 faker 演示数据，仅限开发环境，`NODE_ENV=production` 下执行会被工具拒绝。

### 4. 启动

```bash
NODE_ENV=production pnpm start:dist
```

> **仅安装生产依赖的机器**：`pnpm db:init:mysql` 走 `nest start` 现场编译，依赖 `@nestjs/cli`（devDependencies）。若生产机器用 `pnpm install --prod` 只装了生产依赖，请直接运行构建产物：
>
> ```bash
> NODE_ENV=production node dist/common/modules/database/mysql/tools/init.main
> # PostgreSQL 对应 dist/common/modules/database/pgsql/tools/init.main
> ```

## 命令参考

### 构建

| 命令         | 说明                                        |
| ------------ | ------------------------------------------- |
| `pnpm build` | SWC 构建（默认 builder，带 tsc 类型检查）   |

### 启动

编译统一走 SWC（`nest-cli.json` 中 `builder: "swc"` + `typeCheck: true`），无需单独的 `:swc` 命令。

| 命令               | 环境        | 说明                                 |
| ------------------ | ----------- | ------------------------------------ |
| `pnpm start`       | -           | 直接启动（不设置 NODE_ENV）          |
| `pnpm start:dev`   | development | 开发模式，热重载                     |
| `pnpm start:debug` | -           | 调试模式，热重载 + Node.js inspector |
| `pnpm start:dist`  | -           | 运行编译后的 dist 产物（dist/main）  |

> 生产环境的完整流程（环境变量 / migration / 启动）见上方「[生产环境部署](#生产环境部署)」。

### 测试（Vitest）

| 命令                       | 说明                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `pnpm test <文件路径>`     | 运行指定单元测试（`vitest run`）                                 |
| `pnpm test:watch`          | 监听模式，文件变更自动重跑                                       |
| `pnpm test:cov`            | 运行测试并生成覆盖率报告（`--coverage`）                         |
| `pnpm test:debug`          | 调试模式（`--inspect-brk`，禁用并行，可用 Chrome DevTools 连接） |
| `pnpm test:e2e <文件路径>` | 运行指定端到端测试（`--config ./vitest-e2e.config.ts`）          |

> Vitest 通过 `vitest.config.ts` 中的 `env` 配置设置 `NODE_ENV=test`。

### 数据库

MySQL（默认）：

| 命令                | 说明                                             |
| ------------------- | ------------------------------------------------ |
| `pnpm db:push:mysql`      | 将 Schema 推送到数据库（**仅限开发**，直接同步、不生成迁移文件，禁止用于生产） |
| `pnpm db:generate:mysql`  | 生成迁移文件                                     |
| `pnpm db:migrate:mysql`   | 执行迁移（生产环境表结构变更的唯一方式）         |
| `pnpm db:init:mysql`      | 初始化基础数据（`NODE_ENV` 由调用方传入）        |
| `pnpm db:seed:mysql`      | 填充种子数据（仅限开发环境）                     |

按环境区分的用法：

- **开发**：`pnpm db:push:mysql` 同步表结构 → `NODE_ENV=development pnpm db:init:mysql` → `NODE_ENV=development pnpm db:seed:mysql`；
- **生产**：`pnpm db:migrate:mysql` 执行迁移 → `NODE_ENV=production pnpm db:init:mysql`；**禁止** `db:push`（无迁移文件、不可回滚），`db:seed`（faker 演示数据）在 `NODE_ENV=production` 下会被工具拒绝。

PostgreSQL（可选，与上表一一对应）：`pnpm db:push:pgsql`、`db:generate:pgsql`、`db:migrate:pgsql`、`db:init:pgsql`、`db:seed:pgsql`。

### 代码质量

| 命令          | 说明                  |
| ------------- | --------------------- |
| `pnpm lint`   | ESLint 检查并自动修复 |
| `pnpm format` | Prettier 格式化       |
| `pnpm commit` | Commitizen 交互式提交 |

## 项目结构

```
src/
├── app/                    # 业务模块（按域划分）
│   └── <domain>/           # 单个业务域
│       ├── *.controller.ts
│       ├── *.service.ts
│       ├── *.module.ts
│       ├── dtos/
│       ├── interfaces/
│       └── __tests__/
├── common/                 # 通用模块（跨业务复用）
│   ├── enums/
│   ├── modules/            # 通用 NestJS 模块
│   │   ├── bottleneck/     # 限流模块（可选，默认未装配）
│   │   ├── cache/          # 缓存模块
│   │   ├── database/       # 数据库模块（Drizzle，mysql/ 与 pgsql/ 两套实现）
│   │   ├── distributed-lock/ # 分布式锁模块
│   │   ├── i18n/           # 国际化模块
│   │   ├── logger/         # 日志模块（Pino）
│   │   ├── queue/          # 队列模块（BullMQ）
│   │   └── redis/          # Redis 连接模块
│   └── utils/              # 工具函数
├── configs/                # 配置文件（环境变量校验与映射）
└── database/
    ├── enums/              # 跨表复用的枚举
    ├── mysql/              # MySQL 侧（默认装配）
    │   ├── schemas/        # Drizzle 表定义（index.ts 聚合导出）
    │   ├── utils/          # 建列工具（主键/时间戳/外键）
    │   ├── init.ts         # 初始化逻辑
    │   └── seed.ts         # 种子数据
    └── pgsql/              # PostgreSQL 侧（可选，结构与 mysql/ 平行）
```

## 调试指南

### VS Code 调试 NestJS

1. 运行 `pnpm start:debug`
2. 在 VS Code 中按 `F5` 或通过调试面板 Attach 到 Node.js 进程

### 调试 Vitest 单元测试

```bash
pnpm test:debug <文件路径>
```

然后在 Chrome 打开 `chrome://inspect`，点击 Remote Target 连接。
