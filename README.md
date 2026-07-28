# Nest Scaffold

基于 NestJS 的后端脚手架，集成 Drizzle ORM、BullMQ、Redis、Pino 日志等常用能力。

- **框架**：NestJS 11 + TypeScript 5（SWC 构建，带 tsc 类型检查）
- **ORM**：Drizzle ORM（MySQL / PostgreSQL 双实现，默认装配 MySQL，表结构一律 migration 维护）
- **缓存/队列**：Redis（ioredis）+ BullMQ
- **校验**：zod（项目内轻量 createZodDto 工厂）
- **日志**：nestjs-pino + pino-pretty + pino-roll
- **测试**：Vitest（SWC）+ Supertest + Testcontainers
- **规范**：ESLint + Prettier + Commitizen + GitHub Flow（main 受保护，全量 PR）

**环境要求**：Node.js >= 22、pnpm >= 10、Docker & Docker Compose（本地基础设施）。

**文档地图**：本文覆盖开发/生产两条主线的操作；开发规范细节见 [.claude/skills/nest-scaffold/SKILL.md](.claude/skills/nest-scaffold/SKILL.md)（含 [各场景端到端工作流](.claude/skills/nest-scaffold/reference/workflows.md)、[Git/提交规范](.claude/skills/nest-scaffold/reference/git-commit.md)），AI 代理行为约束见 [CLAUDE.md](CLAUDE.md)。

---

# 一、开发环境

## 1. 首次搭建

```bash
pnpm install                              # 1) 安装依赖
docker compose up -d                      # 2) 启动本地基础设施（仅限开发，见下表）
cp .env.example .env                      # 3) 环境变量：默认值与 docker 服务一一对应，不改即可跑通
pnpm db:migrate:mysql                     # 4) 应用迁移：建表 + 基础数据（开发与生产同一套迁移）
NODE_ENV=development pnpm db:seed:mysql   # 5) 填充演示数据（可选）
pnpm start:dev                            # 6) 启动开发服务（热重载，NODE_ENV 已内置）
```

docker-compose 启动的服务（含管理界面、弱密码默认值，**生产环境不要用**）：

| 服务          | 端口 | 说明                |
| ------------- | ---- | ------------------- |
| MySQL 8.0     | 3306 | 数据库（默认）      |
| PostgreSQL 16 | 5432 | 数据库（可选）      |
| phpMyAdmin    | 8081 | MySQL 管理界面      |
| pgAdmin       | 8082 | PostgreSQL 管理界面 |
| Redis         | 6379 | 缓存/队列           |
| phpRedisAdmin | 8080 | Redis 管理界面      |

<details>
<summary>.env 完整示例（与 .env.example 一致）</summary>

```env
APP_NAME=nest-scaffold
APP_PORT=3000
# CORS 允许来源白名单（英文逗号分隔，精确匹配协议+域名+端口）。
# 留空或含 `*` 表示允许任意来源。生产环境若留空 / `*`+凭证，启动时打 warning、不阻断
# （常见于 CDN / Nginx / API Gateway 已统一管 CORS；本服务直接对外时请配具体白名单）。
# APP_CORS_DOMAINS=https://a.example.com,https://b.example.com
# 是否允许跨域请求携带 Cookie，默认 true（本项目使用 Cookie Session）。
# APP_CORS_CREDENTIALS=true
# 是否信任反向代理的 X-Forwarded-For。默认 false（不信任，req.ip 取 TCP 对端地址，客户端伪造不了）。
# 只有确实部署在 CDN / Nginx / 负载均衡之后才开启，否则任何人都能伪造该头绕过限流与 IP 名单。
# 推荐填代理层数而非 true：APP_TRUST_PROXY=1；也支持 loopback / uniquelocal / IP 段列表
APP_TRUST_PROXY=false

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

# Redis 公共锚点变量（应用不直接读取，仅供下方各模块的 *_REDIS_* 引用；每个模块只读自己的连接配置）
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

# Log
LOG_FILE_ENABLE=true
LOG_FILE_PATH=./logs/app.log

# Cache（自带连接配置，独立 DB：缓存可随时清空，禁止与锁/队列共用）
CACHE_TTL_SECONDS=604800 # 7 days
CACHE_KEY_PREFIX=cache
CACHE_REDIS_HOST=${REDIS_HOST}
CACHE_REDIS_PORT=${REDIS_PORT}
CACHE_REDIS_PASSWORD=${REDIS_PASSWORD}
CACHE_REDIS_DB=0

# Distributed Lock（自带连接配置，独立 DB：锁数据不可丢）
DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock
DISTRIBUTED_LOCK_REDIS_HOST=${REDIS_HOST}
DISTRIBUTED_LOCK_REDIS_PORT=${REDIS_PORT}
DISTRIBUTED_LOCK_REDIS_PASSWORD=${REDIS_PASSWORD}
DISTRIBUTED_LOCK_REDIS_DB=1

# Queue（自带连接配置；BullMQ 需独享连接，独立 DB：队列数据不可丢，禁止与缓存/锁共用）
QUEUE_REDIS_HOST=${REDIS_HOST}
QUEUE_REDIS_PORT=${REDIS_PORT}
QUEUE_REDIS_PASSWORD=${REDIS_PASSWORD}
QUEUE_REDIS_DB=2
QUEUE_KEY_PREFIX=queue
QUEUE_DASHBOARD_ROUTE=/queues
```

`NODE_ENV` 不写入 `.env`，由命令调用方传入（Windows PowerShell 写法：`$env:NODE_ENV="development"; pnpm db:seed:mysql`）。

</details>

> **新项目**：用 `bash .claude/skills/nest-scaffold/scripts/bootstrap.sh <target-dir> <APP_NAME>` 从脚手架生成，建远端仓库后运行 `bash .claude/skills/nest-scaffold/scripts/setup-github.sh` 一次性启用分支保护、仅 Squash merge、自动删分支（幂等，需 gh 已登录；或按 [CLAUDE.md](CLAUDE.md) 规则 A.4 网页手动配置）。

## 2. 日常开发（GitHub Flow）

**`main` 受分支保护：禁止直推与强推**，一切变更走短命分支 + PR。仓库层已强制：PR 需 `ci` / `docker` 两个检查全绿、仅允许 Squash merge（**PR 标题即合入 main 的提交标题**，须符合 `type(scope): subject` 规范）、合并后远端分支自动删除。

```bash
# 1) 从最新 main 开工作分支（命名 <type>/<kebab-topic>）
git checkout main && git pull
git checkout -b feature/user-profile

# 2) 开发并提交（交互式提交：pnpm commit）
git add <files> && pnpm commit

# 3) 本地验证全绿后推送
pnpm lint && pnpm build && pnpm test
git push -u origin feature/user-profile

# 4) 创建 PR → 等检查绿灯 → Squash merge（gh 或网页二选一）
gh pr create --fill && gh pr checks --watch
gh pr merge --squash --delete-branch

# 5) 合并后同步并清理本地分支
git checkout main && git pull && git branch -d feature/user-profile
```

不同任务类型（新功能 / 修改 / 修 bug / 数据库变更等）的端到端流程见 [workflows.md](.claude/skills/nest-scaffold/reference/workflows.md)。

### 仓库设置（PR 门禁清单）

以上约束全部来自 GitHub 仓库设置。新项目执行一次 `bash .claude/skills/nest-scaffold/scripts/setup-github.sh` 即可自动配好（幂等可重跑，需 gh 已登录且有 admin 权限）；也可按下表在网页手动配置：

| 设置项 | 值 | 网页路径 |
| --- | --- | --- |
| Require a pull request before merging | 开启（required approvals 设 0，合并门禁交给 CI；团队协作可调高） | Settings → Branches → Add rule（`main`） |
| Require status checks to pass | 勾选 `ci`、`docker` | 同上 |
| Do not allow bypassing the above settings | 开启（enforce admins，管理员同样不能直推） | 同上 |
| Block force pushes / Allow deletions | 禁强推、禁删除 | 同上 |
| 合并方式 | **仅保留 Squash merge**；默认标题取 PR 标题（`Default to pull request title`）、正文取 PR 描述 | Settings → General → Pull Requests |
| Automatically delete head branches | 开启（合并即删远端分支） | Settings → General |

> 必需检查 `ci` / `docker` 需要 CI 至少跑过一次才会出现在网页候选列表中（新仓库先推送一次代码触发）；用脚本配置不受此限制。

<details>
<summary>工具分工（git / gh / 网页）与补充约定</summary>

| 操作 | 工具 | 说明 |
| --- | --- | --- |
| 提交 / 推送 / 拉取 / 看历史 | 原生 `git`（SSH key） | git 数据操作不走 gh |
| PR 创建 / 查看检查 / Squash 合并 | `gh` CLI **或** 网页 | gh 用前先 `gh auth status` 核验登录账号 |
| 仓库设置（分支保护 / 合并方式 / auto-delete） | `setup-github.sh`（gh api）**或** 网页 Settings | 一次性配置 |
| 代码审查判断、Environments 发布审批 | **必须人工**（网页） | 不可自动化的部分 |

- **PR 评审期间更新**：继续向同一分支 push；整理历史可在工作分支 rebase 后强推（`main` 禁强推，工作分支不受限）。
- **提交规范**：`type(scope): subject`（type/scope 英文，body 中文），详见 [git-commit.md](.claude/skills/nest-scaffold/reference/git-commit.md)。
- **合并即发布**：若配置了持续部署（见生产环境·方式 B），合入 `main` 且 CI 通过即自动上线——合并动作以"可上线"为标准。

</details>

## 3. 数据库变更

**开发与生产用同一套迁移文件**（`drizzle/mysql/`、`drizzle/pgsql/`），保证环境一致：

```bash
# 改 schema（src/database/mysql/schemas/）之后：
pnpm db:generate:mysql        # 1) 生成迁移文件 —— 必须人工检查生成的 SQL
pnpm db:migrate:mysql         # 2) 应用到本地库
# 3) 迁移文件随本次代码同一个 PR 提交
```

- **基础/默认数据**同样走迁移：`pnpm db:generate:mysql --custom --name=<name>` 生成空迁移后手写 SQL（示例 `drizzle/mysql/0001_base-data.sql`）；
- **演示数据**：`NODE_ENV=development pnpm db:seed:mysql`（faker 数据，仅限开发，生产会被工具拒绝）；
- **重置本地库**：`NODE_ENV=development pnpm db:reset:mysql`（删全部表后重放迁移，回到基线；仅限开发）；
- PostgreSQL 对应命令为 `:pgsql` 后缀；
- ⚠️ `drizzle-kit push` **不提供 npm script**——无迁移文件的直接同步只适合一次性实验库，确需时手动 `pnpm exec drizzle-kit push --config drizzle-mysql.config.ts`。

## 4. 测试与调试

| 命令                       | 说明                                                    |
| -------------------------- | ------------------------------------------------------- |
| `pnpm test <文件路径>`     | 单元测试（`vitest run`）                                |
| `pnpm test:watch`          | 监听模式                                                |
| `pnpm test:cov`            | 覆盖率报告 + 阈值检查（CI 同款）                        |
| `pnpm test:e2e <文件路径>` | 端到端测试（testcontainers 拉真实容器）                 |

调试：应用用 `pnpm start:debug` + IDE Attach；测试推荐在 VS Code 的 **JavaScript Debug Terminal** 里直接 `pnpm test <文件路径>`（断点自动生效），无 IDE 时 `pnpm exec vitest run --inspect-brk --no-file-parallelism --test-timeout=0 <文件路径>` + Chrome `chrome://inspect`。

---

# 二、生产环境

与开发环境的关键差异（红线）：

- 基础设施**独立部署**，不使用本仓库的 docker-compose（那是带弱密码的开发套件）；
- `NODE_ENV=production` 由启动命令或平台注入，不写入 `.env`；
- 表结构与基础数据**只走 migration**（`db:migrate:*`）；`db:seed` / `db:reset` 在生产会被工具直接拒绝；
- 环境变量指向生产实例并使用强密码，建议由部署平台（K8s / systemd / PaaS）注入，或独立维护不入库的 `.env`。

## 方式 A · 容器部署（推荐）

脚手架提供生产镜像定义（`Dockerfile`：多阶段构建 → 仅生产依赖 → 非 root 运行 `node dist/main`，**自带迁移文件与 drizzle-kit**），CI 每次提交都验证其可构建。发布节奏：打版本标签（`git tag v0.1.0 && git push origin v0.1.0`），镜像是版本化制品、可按版本回滚。

```bash
# 部署机拉取并运行（镜像由下方 CD 工作流构建推送）
docker run -d --env-file .env.production -e NODE_ENV=production \
  -p 3000:3000 ghcr.io/<owner>/<repo>:0.1.0

# 数据库迁移在部署流程中执行（容器内自带）
docker run --rm --env-file .env.production ghcr.io/<owner>/<repo>:0.1.0 \
  npx drizzle-kit migrate --config drizzle-mysql.config.ts
```

<details>
<summary>CD 示例 workflow：v* 标签触发，构建镜像推送 ghcr.io（保存为 .github/workflows/cd.yml）</summary>

> 示例用 `ghcr.io`：对 GitHub 仓库零配置（`GITHUB_TOKEN` 直接可用）且公开镜像免费。**私有项目请评估**——私有镜像的存储/流量计入 GitHub 套餐配额（Free 仅 500MB + 1GB/月，本镜像约 440MB）、部署机拉取需 PAT 登录、国内可达性差；通常更适合云厂商仓库（阿里云 ACR / AWS ECR 等），只需替换 `login-action` 的 `registry`+凭据与 `images` 前缀。

```yaml
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

## 方式 B · 裸机 / 面板部署（宝塔、1Panel 等）

手动部署三步：

```bash
pnpm install && pnpm build                                  # 1) 构建
pnpm db:migrate:mysql                                       # 2) 迁移（表结构 + 基础数据）
NODE_ENV=production pnpm start:dist                         # 3) 启动（node dist/main）
```

> 仅装生产依赖的机器（`pnpm install --prod`）：迁移直接 `npx drizzle-kit migrate --config drizzle-mysql.config.ts`（drizzle-kit 在生产依赖中，不依赖 @nestjs/cli）。

持续部署（合入 `main` 且 CI 全绿即自动发布，与宝塔「Node 项目」的 PM2 托管天然兼容）：

<details>
<summary>CD 示例 workflow：CI 通过后 SSH 上传产物并 PM2 重启（保存为 .github/workflows/cd.yml）</summary>

> 前置：服务器预装 Node 22 + pnpm + PM2；仓库 Secrets 配置 `SSH_HOST` / `SSH_USER` / `SSH_KEY`（部署专用私钥）；`.env` 在服务器部署目录内维护，不随部署覆盖。

```yaml
name: CD
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
  workflow_dispatch:
env:
  DEPLOY_PATH: /www/wwwroot/my-app # 宝塔站点目录 / 服务器部署目录
jobs:
  deploy:
    # 手动触发直接放行；workflow_run 触发时要求 CI 结论为 success
    if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # 部署 CI 验证过的那个提交（workflow_run 默认检出的是最新 main，二者可能不同）
          ref: ${{ github.event.workflow_run.head_sha || github.sha }}
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

## CI 与发布说明

- **CI**（`.github/workflows/ci.yml`，随仓库自带）：push 到 `main` 或 PR 时自动运行两个并行任务——① 安装（frozen-lockfile）→ lint → 构建 → 单测（含覆盖率阈值）→ E2E；② 生产镜像构建验证。`ci` / `docker` 即分支保护的必需检查。
- **CD 不内置**：发布节奏与部署目标是业务项目的决策；脚手架交付 `Dockerfile` 与上面两份可直接采用的示例 workflow。
- **多环境 / 发布审批**：不要用常驻环境分支（可变、会漂移，与"常态只保留 main"冲突）；需要审批或多环境时用 **GitHub Environments**（部署 job 声明 `environment: production` + required reviewers），原生获得审批门禁、环境专属 Secrets 与部署历史。
- 镜像/产物之后的编排（K8s / Swarm / systemd）依基础设施而定，不在脚手架内约定。

---

# 三、参考

## 命令速查

| 类别 | 命令 | 说明 |
| --- | --- | --- |
| 构建 | `pnpm build` | SWC 构建（带 tsc 类型检查），产物 `dist/main.js` |
| 启动 | `pnpm start:dev` | 开发模式，热重载（内置 NODE_ENV=development） |
| 启动 | `pnpm start:debug` | 热重载 + Node.js inspector |
| 启动 | `pnpm start:dist` | 运行构建产物（生产：前缀 `NODE_ENV=production`） |
| 测试 | `pnpm test` / `test:watch` / `test:cov` / `test:e2e` | 见「开发环境 · 测试与调试」 |
| 数据库 | `pnpm db:generate:mysql` | schema 变更后生成迁移（`--custom --name=<n>` 生成数据迁移） |
| 数据库 | `pnpm db:migrate:mysql` | 应用迁移（开发/生产统一方式） |
| 数据库 | `pnpm db:seed:mysql` | 演示数据（仅开发，需 NODE_ENV=development） |
| 数据库 | `pnpm db:reset:mysql` | 重置到迁移基线（仅开发） |
| 数据库 | `…:pgsql` | PostgreSQL 侧与上述一一对应 |
| 质量 | `pnpm lint` / `lint:check` | ESLint（--fix / CI 只读） |
| 质量 | `pnpm format` | Prettier 格式化 |
| 质量 | `pnpm commit` | Commitizen 交互式提交 |

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
├── common/
│   ├── enums/
│   ├── modules/            # 通用基础设施模块（全部 @Global()）
│   │   ├── bottleneck/ cache/ database/ distributed-lock/ i18n/ logger/ queue/
│   └── utils/              # 工具函数（date-time / zod / register-env-as-config 等）
├── configs/                # 环境变量校验与映射（zod schema）
└── database/
    ├── enums/              # 跨表复用的枚举
    ├── mysql/              # MySQL 侧（默认装配）：schemas/ utils/ seed.ts
    └── pgsql/              # PostgreSQL 侧（可选，结构与 mysql/ 平行）
drizzle/                    # 迁移文件（mysql/ 与 pgsql/，随代码提交）
```

## 更多文档

- [SKILL.md](.claude/skills/nest-scaffold/SKILL.md)：开发规范唯一入口（命名/分层/DTO/数据库/测试的决策树）
- [workflows.md](.claude/skills/nest-scaffold/reference/workflows.md)：新项目/新功能/修改/修 bug 等场景的端到端工作流
- [git-commit.md](.claude/skills/nest-scaffold/reference/git-commit.md)：提交规范、分支与推送、gh 用法
- [scripts/README.md](.claude/skills/nest-scaffold/scripts/README.md)：bootstrap / new-module / setup-github 脚本
- [CLAUDE.md](CLAUDE.md)：AI 代理行为约束（含 Git 身份/隐私硬规定）
- 各基础设施模块用法：`src/common/modules/*/README.md`
