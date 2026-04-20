# Nest Scaffold

基于 NestJS 的后端脚手架项目，集成 Drizzle ORM、BullMQ、Redis、Pino 日志、Swagger 等常用能力。

## 技术栈

- **框架**：NestJS 11
- **语言**：TypeScript 5
- **ORM**：Drizzle ORM（MySQL）
- **缓存/队列**：Redis（ioredis）+ BullMQ
- **日志**：nestjs-pino + pino-pretty + pino-roll
- **API 文档**：Swagger（@nestjs/swagger）
- **测试**：Jest + Vitest + Supertest + Testcontainers
- **代码规范**：ESLint + Prettier + Commitizen

## 环境要求

- Node.js >= 18
- pnpm >= 8
- Docker & Docker Compose（用于 MySQL、Redis 等基础设施）

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

| 服务          | 端口 | 说明           |
| ------------- | ---- | -------------- |
| MySQL 8.0     | 3306 | 数据库         |
| phpMyAdmin    | 8080 | 数据库管理界面 |
| Redis         | 6379 | 缓存/队列      |
| phpRedisAdmin | 8081 | Redis 管理界面 |

### 3. 配置环境变量

复制 `.env.example` 为 `.env`，按需修改：

```env
APP_NAME=nest-scaffold
PORT=3000

# MySQL
MYSQL_HOST=Localhost
MYSQL_PORT=3306
MYSQL_DATABASE=${APP_NAME}
MYSQL_USER=root
MYSQL_PASSWORD=root_password

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

| 命令             | 说明                              |
| ---------------- | --------------------------------- |
| `pnpm build`     | 使用 tsc 构建                     |
| `pnpm build:swc` | 使用 SWC 构建（更快，带类型检查） |

### 启动

| 命令                   | 环境        | 说明                                 |
| ---------------------- | ----------- | ------------------------------------ |
| `pnpm start`           | -           | 直接启动（不设置 NODE_ENV）          |
| `pnpm start:dev`       | development | 开发模式，热重载                     |
| `pnpm start:debug`     | -           | 调试模式，热重载 + Node.js inspector |
| `pnpm start:dist`      | -           | 运行编译后的 dist 产物               |
| `pnpm start:swc`       | -           | SWC 编译启动                         |
| `pnpm start:swc:dev`   | development | SWC 编译 + 热重载                    |
| `pnpm start:swc:debug` | -           | SWC 编译 + 调试模式                  |

> **注意**：生产环境启动前需先执行 `pnpm build`，然后 `NODE_ENV=production pnpm start:dist`。

### 测试（Jest）

| 命令                       | 说明                                                   |
| -------------------------- | ------------------------------------------------------ |
| `pnpm test <文件路径>`     | 运行指定单元测试                                       |
| `pnpm test:watch`          | 监听模式，文件变更自动重跑                             |
| `pnpm test:cov`            | 运行测试并生成覆盖率报告                               |
| `pnpm test:debug`          | 调试模式（`--inspect-brk`，可用 Chrome DevTools 连接） |
| `pnpm test:e2e <文件路径>` | 运行指定端到端测试                                     |

> Jest 会自动将 `NODE_ENV` 设为 `test`。

### 测试（Vitest）

| 命令                         | 说明                                  |
| ---------------------------- | ------------------------------------- |
| `pnpm vitest <文件路径>`     | 运行指定单元测试                      |
| `pnpm vitest:watch`          | 监听模式                              |
| `pnpm vitest:cov`            | 运行测试并生成覆盖率报告              |
| `pnpm vitest:debug`          | 调试模式（`--inspect-brk`，禁用并行） |
| `pnpm vitest:e2e <文件路径>` | 运行指定端到端测试                    |

> Vitest 通过 `vitest.config.ts` 中的 `env` 配置设置 `NODE_ENV=test`。

### 数据库

| 命令                | 说明                                             |
| ------------------- | ------------------------------------------------ |
| `pnpm db:push`      | 将 Schema 推送到数据库（开发用，不生成迁移文件） |
| `pnpm db:generate`  | 生成迁移文件                                     |
| `pnpm db:migrate`   | 执行迁移                                         |
| `pnpm db:init:dev`  | 开发环境：初始化基础数据                         |
| `pnpm db:seed:dev`  | 开发环境：填充种子数据                           |
| `pnpm db:init:prod` | 生产环境：初始化基础数据（需先 build）           |
| `pnpm db:seed:prod` | 生产环境：填充种子数据（需先 build）             |

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
│   │   ├── database/       # 数据库模块（Drizzle）
│   │   └── logger/         # 日志模块（Pino）
│   └── utils/              # 工具函数
├── configs/                # 配置文件（环境变量校验与映射）
└── database/
    ├── schemas/            # Drizzle 表定义
    ├── schema.ts           # Schema 聚合导出
    ├── init.ts             # 初始化逻辑
    └── seed.ts             # 种子数据
```

## 调试指南

### VS Code / Cursor 调试 NestJS

1. 运行 `pnpm start:debug`
2. 在 VS Code 中按 `F5` 或通过调试面板 Attach 到 Node.js 进程

### 调试 Jest 单元测试

```bash
pnpm test:debug -- <文件路径>
```

然后在 Chrome 打开 `chrome://inspect`，点击 Remote Target 连接。

### 调试 Vitest 单元测试

```bash
pnpm vitest:debug <文件路径>
```

同样通过 `chrome://inspect` 连接。
