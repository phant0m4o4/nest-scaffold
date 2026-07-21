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
| phpMyAdmin    | 8081 | MySQL 管理界面      |
| pgAdmin       | 8082 | PostgreSQL 管理界面 |
| Redis         | 6379 | 缓存/队列           |
| phpRedisAdmin | 8080 | Redis 管理界面      |

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
# 应用迁移文件建表并写入基础数据（开发与生产同一套迁移，schema 变更见「命令参考 · 数据库」）
pnpm db:migrate:mysql

# 填充种子数据
NODE_ENV=development pnpm db:seed:mysql
```

> `db:seed:mysql` 不内置环境，`NODE_ENV` 由调用方传入（Windows PowerShell 用 `$env:NODE_ENV="development"; pnpm db:seed:mysql`）。

### 5. 启动开发服务

```bash
pnpm start:dev
```

## 生产环境部署

与开发环境的关键差异：基础设施独立部署（不使用本仓库的 docker-compose）、`NODE_ENV=production`、表结构变更只走 migration、不填充 seed 演示数据。

以下为裸机/虚机直接部署的流程；**推荐用容器部署**——由 CD 构建的生产镜像开箱即用，见下文「[CI / CD](#ci--cd)」。

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
# 应用迁移（迁移文件在开发期用 db:generate:mysql 生成并随代码入库，
# 开发与生产执行的是同一套迁移文件，表结构与基础数据一次性完成）
pnpm db:migrate:mysql
```

> seed 填充的是 faker 演示数据，仅限开发环境，`NODE_ENV=production` 下执行会被工具拒绝。

### 4. 启动

```bash
NODE_ENV=production pnpm start:dist
```

> **仅安装生产依赖的机器**：`drizzle-kit` 在生产依赖中，直接执行迁移即可（不再依赖 `@nestjs/cli`）：
>
> ```bash
> npx drizzle-kit migrate --config drizzle-mysql.config.ts
> ```

## CI / CD

- **CI**（`.github/workflows/ci.yml`）：push 到 `main` 或 PR 时自动运行两个并行任务——① `pnpm install --frozen-lockfile` → `lint:check` → 构建 → 单元测试 → E2E（testcontainers 使用 runner 自带 Docker）；② 生产镜像构建验证（`Dockerfile` 只构建不推送）。
- **CD**：脚手架不内置 CD 工作流——发布节奏、触发时机与部署目标是业务项目的决策，预置的流程终究会被改写或删除。脚手架交付的是 CD 真正依赖的底座：
  - **生产镜像定义**（`Dockerfile`）：多阶段构建，SWC 构建 → 仅生产依赖 → 非 root 用户运行 `node dist/main`，自带迁移文件与 `drizzle-kit`；
  - **持续的可构建性保证**：CI 每次提交都验证该镜像能在干净环境构建成功。

下游项目按部署形态二选一（发版动作相同：`git tag v0.1.0 && git push origin v0.1.0`）：

### 方案 A · 容器镜像（有容器运行时 / K8s / 多实例）

1. **添加工作流**：把下方示例保存为 `.github/workflows/cd.yml`（按需调整触发条件与镜像仓库）。示例用 `ghcr.io` 是因为它对 GitHub 仓库零配置（`GITHUB_TOKEN` 直接可用）且公开镜像免费；**私有项目请评估**——私有镜像的存储/外部流量计入 GitHub 套餐配额（Free 仅 500MB + 1GB/月，本镜像约 440MB）、部署机拉取需 PAT 登录、国内网络可达性差，通常更适合换成云厂商仓库（阿里云 ACR / AWS ECR 等），只需替换 `login-action` 的 `registry`+凭据与 `images` 前缀，其余步骤通用；
2. **发版**：打标签推送后镜像自动构建并推送到 `ghcr.io/<owner>/<repo>`；
3. **部署**：部署机拉取镜像运行（见下方命令），数据库迁移用容器内自带的 `drizzle-kit` 在部署流程中执行。

<details>
<summary>方案 A 示例 workflow：v* 标签触发，构建镜像推送 ghcr.io</summary>

```yaml
# .github/workflows/cd.yml
name: CD
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  packages: write
jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=sha
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

</details>

```bash
# 部署机拉取并运行（环境变量按「生产环境部署」章节准备）
docker run -d --env-file .env.production -e NODE_ENV=production \
  -p 3000:3000 ghcr.io/<owner>/<repo>:0.1.0
```

### 方案 B · SSH 直连部署（单机 + 宝塔/1Panel 等面板）

Actions 上构建产物，经 SSH 上传服务器后安装生产依赖、执行迁移、PM2 重启——不要求服务器有容器运行时，与宝塔的「Node 项目」天然兼容（其底层就是 PM2 托管，站点目录即部署目录）。前置条件：服务器预装 Node 22 + pnpm + PM2，仓库 Secrets 配置 `SSH_HOST` / `SSH_USER` / `SSH_KEY`（部署专用私钥）；`.env` 在服务器部署目录内维护，不随部署覆盖。

<details>
<summary>方案 B 示例 workflow：v* 标签触发，SSH 上传产物并重启</summary>

```yaml
# .github/workflows/cd.yml
name: CD
on:
  push:
    tags: ['v*']
env:
  DEPLOY_PATH: /www/wwwroot/my-app # 宝塔站点目录 / 服务器部署目录
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: 打包部署产物
        run: >-
          tar -czf release.tgz dist drizzle
          drizzle-mysql.config.ts drizzle-pgsql.config.ts
          package.json pnpm-lock.yaml
      - name: 上传到服务器
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_KEY }}
          source: release.tgz
          target: ${{ env.DEPLOY_PATH }}
      - name: 远程发布（解包 → 生产依赖 → 迁移 → 重启）
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            set -e
            cd ${{ env.DEPLOY_PATH }}
            tar -xzf release.tgz && rm release.tgz
            pnpm install --prod --frozen-lockfile
            npx drizzle-kit migrate --config drizzle-mysql.config.ts
            NODE_ENV=production pm2 restart my-app --update-env \
              || NODE_ENV=production pm2 start dist/main.js --name my-app
```

</details>

> 镜像/产物之后的部署编排（K8s / Docker Swarm / 裸机 systemd 等）依基础设施而定，不在脚手架内约定。

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
| `pnpm test:e2e <文件路径>` | 运行指定端到端测试（`--config ./vitest-e2e.config.ts`）          |

> Vitest 通过 `vitest.config.ts` 中的 `env` 配置设置 `NODE_ENV=test`。

### 数据库

MySQL（默认）：

| 命令                | 说明                                             |
| ------------------- | ------------------------------------------------ |
| `pnpm db:generate:mysql`  | schema 变更后生成迁移文件（`drizzle/mysql/`，随代码入库） |
| `pnpm db:migrate:mysql`   | 应用迁移（开发与生产统一的表结构维护方式）       |
| `pnpm db:seed:mysql`      | 填充种子数据（仅限开发环境）                     |
| `pnpm db:reset:mysql`     | 重置数据库到迁移基线：删除全部表后重放所有迁移（仅限开发环境，生产会被拒绝） |

**开发与生产都用 migration 维护表结构**（同一套迁移文件保证环境一致）：

- **开发**：改 schema → `pnpm db:generate:mysql` 生成迁移（检查生成的 SQL）→ `pnpm db:migrate:mysql` 应用 → 迁移文件随代码提交；基础数据用自定义数据迁移维护（`pnpm db:generate:mysql --custom --name=<name>` 生成空迁移后手写 SQL，示例 `drizzle/mysql/0001_base-data.sql`）；再按需 `NODE_ENV=development pnpm db:seed:mysql`；
- **生产**：`pnpm db:migrate:mysql` 应用已入库的迁移（含基础数据）；`db:seed`（faker 演示数据）在 `NODE_ENV=production` 下会被工具拒绝。

> `drizzle-kit push`（无迁移文件的直接同步）**不提供 npm script**——它只适合一次性实验库的快速原型，确需使用时手动执行 `pnpm exec drizzle-kit push --config drizzle-mysql.config.ts`，不要用于任何需要延续的数据库。

PostgreSQL（可选，与上表一一对应）：`pnpm db:generate:pgsql`、`db:migrate:pgsql`、`db:seed:pgsql`、`db:reset:pgsql`，迁移文件在 `drizzle/pgsql/`。

### 代码质量

| 命令          | 说明                  |
| ------------- | --------------------- |
| `pnpm lint`   | ESLint 检查并自动修复 |
| `pnpm format` | Prettier 格式化       |
| `pnpm commit` | Commitizen 交互式提交 |

## 项目结构

```
src/
├── app/
│   ├── api/                # 业务模块（按域划分）
│   │   ├── common/         # 跨业务复用 DTO/Entity（分页等）
│   │   └── <domain>/       # 单个业务域：controller/service/module/dtos/entities/__tests__
│   ├── exceptions/         # ZodValidationException（自带 422 响应体）
│   ├── interceptors/       # GlobalResponseInterceptor（统一响应包装）
│   ├── pipes/              # I18nZodValidationPipe（全局 zod 校验）
│   └── repositories/       # 仓储层（继承 BaseRepository，mysql/pgsql 两套实现）
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
    │   └── seed.ts         # 种子数据
    └── pgsql/              # PostgreSQL 侧（可选，结构与 mysql/ 平行）
```

## 调试指南

### VS Code 调试 NestJS

1. 运行 `pnpm start:debug`
2. 在 VS Code 中按 `F5` 或通过调试面板 Attach 到 Node.js 进程

### 调试 Vitest 单元测试

推荐方式：在 VS Code 的 **JavaScript Debug Terminal** 中直接运行 `pnpm test <文件路径>`，断点自动生效，无需任何附加参数。

不依赖 IDE 时，用 vitest 原生参数挂起等待 Chrome DevTools：

```bash
pnpm exec vitest run --inspect-brk --no-file-parallelism --test-timeout=0 <文件路径>
```

然后在 Chrome 打开 `chrome://inspect`，点击 Remote Target 连接（`--inspect-brk` 要求单进程，故需搭配 `--no-file-parallelism`）。
