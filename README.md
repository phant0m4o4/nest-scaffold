# Nest Scaffold

基于 NestJS 的后端脚手架项目，集成 Drizzle ORM、BullMQ、Redis、Pino 日志等常用能力。

## 技术栈

- **框架**：NestJS 11
- **语言**：TypeScript 5
- **ORM**：Drizzle ORM（MySQL / PostgreSQL 双实现，默认装配 MySQL）
- **缓存/队列**：Redis（ioredis）+ BullMQ
- **日志**：nestjs-pino + pino-pretty + pino-roll
- **校验**：zod + nestjs-zod
- **测试**：Vitest（SWC）+ Supertest + Testcontainers
- **代码规范**：ESLint + Prettier + Commitizen

## 环境要求

- Node.js >= 22
- pnpm >= 10
- Docker & Docker Compose（用于 MySQL、PostgreSQL、Redis 等基础设施）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动基础设施

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

复制 `.env.example` 为 `.env`，按需修改：

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
# 推送表结构到数据库
pnpm db:push

# 初始化基础数据
pnpm db:init:dev

# 填充种子数据
pnpm db:seed:dev
```

### 5. 启动开发服务

```bash
pnpm start:dev
```

### 6. 生产环境启动

```bash
# 1. 安装依赖
pnpm install

# 2. 构建
pnpm build

# 3. 按需执行数据库迁移与种子（若使用迁移）
# pnpm db:migrate
# pnpm db:init:prod
# pnpm db:seed:prod

# 4. 启动（需设置 NODE_ENV=production）
NODE_ENV=production pnpm start:dist
```

> 生产环境请确保已配置好 `.env` 或环境变量（数据库、Redis、日志等），并已准备好 MySQL、Redis 等基础设施。

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

> **注意**：生产环境启动前需先执行 `pnpm build`，然后 `NODE_ENV=production pnpm start:dist`。

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
| `pnpm db:push`      | 将 Schema 推送到数据库（开发用，不生成迁移文件） |
| `pnpm db:generate`  | 生成迁移文件                                     |
| `pnpm db:migrate`   | 执行迁移                                         |
| `pnpm db:init:dev`  | 开发环境：初始化基础数据                         |
| `pnpm db:seed:dev`  | 开发环境：填充种子数据                           |
| `pnpm db:init:prod` | 生产环境：初始化基础数据（需先 build）           |
| `pnpm db:seed:prod` | 生产环境：填充种子数据（需先 build）             |

PostgreSQL（可选，与上表一一对应）：`pnpm db:push:pg`、`db:generate:pg`、`db:migrate:pg`、`db:init:pg:dev`、`db:seed:pg:dev`、`db:init:pg:prod`、`db:seed:pg:prod`。

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
