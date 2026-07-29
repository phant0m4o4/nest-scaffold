---
name: nest-scaffold
description: NestJS + Drizzle ORM + Redis/BullMQ/Pino 后端脚手架的开发规范与工具集。用于在本仓库或同款脚手架内开发业务模块（控制器/服务/DTO/Drizzle schema/仓储/测试），或基于本仓库从零 bootstrap 一个新项目。当用户提到“按本项目规范”“新建模块”“新增表/Schema”“写 Repository/Service/Controller/DTO”“写仓储或服务测试”“起一个 NestJS 脚手架”“bootstrap NestJS 项目”时使用。
---

# Nest Scaffold Skill

NestJS 11 + TypeScript 5 + Drizzle ORM (MySQL) + ioredis + BullMQ + nestjs-pino 的后端脚手架规范。

适用场景：

1. 在**本仓库或同款脚手架内**开发新业务模块、新 Drizzle 表、新仓储/服务/控制器、对应单元/E2E 测试。
2. 在新目录从零 **bootstrap** 一个同款脚手架，复用所有基础设施模块（Cache / Queue / DistributedLock / Logger / Database / I18n / Bottleneck，需要 Redis 的模块各自建连）。

## 何时使用本 Skill

- 用户要"新增一个业务模块"、"新加一张表"、"写 Repository / Service / Controller"、"补单元/E2E 测试"。
- 用户要重构、补全、修改现有模块，需要遵循项目命名/分层/依赖注入/响应格式约定。
- 用户要起新项目，希望与本仓库一致：`docker-compose.yml`、`.env`、`AppModule`、`common/modules/*`、Drizzle 配置、Vitest、Commitizen、ESLint/Prettier 等。

## 核心约束（始终生效）

这些约束在任何操作前都必须遵守，违反时停止并向用户确认：

1. **包管理器只用 pnpm**。命令使用 `pnpm <script>`，不要用 npm/yarn。
2. **TypeScript 严禁 `any`**。需要时改用 `unknown` 或精确类型。
3. **目录与文件名一律 kebab-case + dots**：`user-profile.service.ts`、`access-key.module.ts`。`__tests__/` 是双下划线例外。
4. **类 PascalCase / 变量与方法 camelCase / 私有成员以 `_` 开头**。
5. **路径别名固定 `@/*` → `src/*`**。新代码中跨目录引用必须用 `@/`，不要写 `../../../`。
6. **每个文件只有一个导出**（默认导出或单一具名导出）。
7. **表结构一律用 migration 维护**（开发与生产同一套迁移文件）：schema 变更后 `pnpm db:generate:mysql --name=<kebab>` 生成迁移（**必须带 `--name`**，避免随机后缀）→ 检查 SQL → `pnpm db:migrate:mysql` 应用 → 迁移文件（`drizzle/<dialect>/`）随代码提交。**没有 push 脚本**——`drizzle-kit push` 只是一次性实验工具，不要引入日常流程。
8. **Drizzle 表必须有 `id` 主键列**，否则 `BaseRepository` 会在启动时抛错。`BaseRepository` 通过列名 `deletedAt` 自动判定软删除。
9. **代码英文 / 注释和文档中文 / 日志 `msg` 中文 + `event` 英文枚举**。
10. **Git commit**：`type(scope): subject`（type/scope 必须英文），body 必须中文。详见 `reference/git-commit.md`。

不确定时，先读对应的 `reference/*.md` 再动手。

## 目录速查（本仓库实际结构）

```
src/
├── app/
│   ├── api/                    # 业务模块（按域划分）
│   │   ├── api.module.ts
│   │   ├── common/             # 跨业务复用 DTO/Entity（分页等）
│   │   └── <domain>/           # 单域：controller/service/module/dtos/entities/__tests__
│   ├── interceptors/           # 全局响应拦截器等
│   ├── repositories/           # 仓储层（继承 BaseRepository）
│   │   └── common/             # mysql/ 与 pgsql/ 各自的 BaseRepository + 共享的异常、分页接口
│   └── app.module.ts
├── common/
│   ├── enums/                  # 跨模块通用枚举
│   ├── modules/                # 通用基础设施模块（全部 @Global()）
│   │   ├── bottleneck/ cache/ database/ distributed-lock/ i18n/ logger/ queue/
│   └── utils/                  # 通用工具：register-env-as-config、date-time、hash 等
├── configs/                    # 各模块的 ConfigModule（registerEnvAsConfig）
├── database/
│   ├── enums/                  # 跨表复用的枚举（camelCase 键值）
│   ├── mysql/                  # MySQL 侧（默认装配）
│   │   ├── schemas/            # Drizzle 表定义（每张表 *.schema.ts，index.ts 聚合导出）
│   │   ├── utils/              # createPrimaryKeyColumn / createPublicIdColumn / createTimestamps / createForeignKeyColumn
│   │   └── seed.ts             # SeedService（NODE_ENV=development pnpm db:seed:mysql）
│   └── pgsql/                  # PostgreSQL 侧（可选，结构与 mysql/ 平行，命令后缀 :pgsql）
└── main.ts                     # Pino logger、enableCors、trust proxy、process.once 平滑停机（含超时兜底）
```

详细架构见 `reference/architecture.md`。

## 决策树：用户想做什么？

| 用户意图 | 工作流 | 详细参考 |
|---------|-------|---------|
| 任意任务的端到端流程（新项目/新功能/修改/修 bug/数据库变更/文档） | 见 `reference/workflows.md`（准备→实施→验证→交付） | `reference/workflows.md` |
| 里程碑任务验收 / PR 四档产物 / 循环 review | 见 `reference/task-acceptance.md`（完成定义以此为准） | `reference/task-acceptance.md` + `reports/` |
| 工程不变量 / 安全隐私 / 数据与分层底线（审查对照表） | 见 `reference/engineering-conventions.md` | `reference/engineering-conventions.md` |
| 新增业务模块（含 controller/service/dto/repository/tests） | 见下方"工作流 A" | `reference/module-development.md` + `reference/rest-api.md` |
| 新增一张数据库表 | 见下方"工作流 B" | `reference/database.md` |
| 写/改测试（Vitest） | 见 `reference/testing.md` | `reference/testing.md` |
| 使用 Cache / Queue / DistributedLock / Logger 或自建 Redis 连接 | 看对应模块 README + 见 `reference/infra-modules.md` | `reference/infra-modules.md` |
| 加配置（环境变量） | 在 `src/configs/<name>.config.ts` 写 zod 环境变量 schema + `registerEnvAsConfig` | `reference/env-vars.md` |
| 写 commit message | 见 `reference/git-commit.md` | `reference/git-commit.md` |
| 从零 bootstrap 新项目 | 运行 `scripts/bootstrap.sh <target-dir> <APP_NAME>` | `scripts/README.md` |

---

## 工作流 A：新增业务模块

**目标**：在 `src/app/api/<domain>/` 下生成完整自包含的业务模块。

### 推荐方式：使用脚本

在仓库根目录执行：

```bash
bash .claude/skills/nest-scaffold/scripts/new-module.sh <domain-kebab>
# 示例
bash .claude/skills/nest-scaffold/scripts/new-module.sh user-profile
```

脚本会按本仓库约定生成完整目录骨架（controller/service/module/dtos/entities/repository/__tests__），并替换占位符。

生成后必须做的人工步骤：

1. 在 `src/database/mysql/schemas/` 增加对应表（如尚未存在）并在 `schemas/index.ts` 导出。
2. 在 `<Feature>Repository` 中确认表名、特殊查询方法。
3. 在 `<Feature>Service` 中实现真实业务逻辑（脚本只生成 CRUD 桩）。
4. 在 `src/app/api/api.module.ts` 中 `imports` 新模块。
5. `pnpm lint && pnpm build` 验证；按需 `pnpm test` / `pnpm test:e2e`。

### 手写时的最小骨架

如果需要手写（例如脚本不可用），请严格参照以下要点：

- 控制器统一返回 `{ data?, meta? }`，由 `GlobalResponseInterceptor` 包装为 `{ statusCode, data?, meta? }`。
- CRUD 方法名固定：`create` / `findOne` / `findMany` / `findManyByCursorPagination` / `update` / `remove` / `findAll`。
- DTO 一律放 `dtos/` 下，命名 `create-<feature>-request.dto.ts`、`update-<feature>-request.dto.ts`、`find-many-<feature>-request.dto.ts`、`find-one-<feature>-param.dto.ts`、`<feature>-response.dto.ts`（实体可放 `entities/<feature>.entity.ts`）。
- 请求/响应 DTO 一律用 `createZodDto(z.object({ ... }))` 定义（zod，项目内 createZodDto 工厂），控制器返回时用 `EntityClass.create(raw)` 净化（zod 默认剔除 schema 未声明的字段）。
- Service 注入仓储；分页查询从 `BaseRepository` 继承的 `findManyWithCursorPagination` / `findManyWithPagination` 调用。
- `<Feature>Module` 通过 `RepositoryModule.forFeature([<Feature>Repository])` 注册仓储。

完整模板见 `templates/feature-module/`，详细规范见 `reference/module-development.md` 与 `reference/rest-api.md`。

---

## 工作流 B：新增数据库表

1. 在 `src/database/enums/` 决定是否需要枚举（跨文件复用才放这里，键值用 camelCase）。
2. 在 `src/database/mysql/schemas/<table-name>.schema.ts` 用 Drizzle MySQL 定义：
   - 必须 `id: createPrimaryKeyColumn()`（来自 `@/database/mysql/utils/create-primary-key`）。
   - 用户端路径用长码列：`createPublicIdColumn()` + `unique()`，**列名按业务语义**（如 `accessKey`；demo 泛化名 `publicId` 仅示例）。推荐码等另加短码列：`createPublicIdColumn('inviteCode', 8)` + `unique()`。写入在仓储**重载 `create`**（长码直插、短码先查空；见 `reference/database.md`）。管理端可暴露 `id`。
   - 时间戳用 `...createTimestamps()`，需要软删除则 `...createTimestampsWithSoftDelete()`（自动生成 `deletedAt`，`BaseRepository` 会识别）。
   - 外键用 `createForeignKeyColumn()`。
3. 在 `src/database/mysql/schemas/index.ts` 重导出新 schema。
4. 基础数据用自定义数据迁移维护（`pnpm db:generate:mysql --custom --name=<name>` 生成空迁移后手写 SQL，示例 `drizzle/mysql/0001_base-data.sql`）；演示数据更新 `src/database/mysql/seed.ts`（使用 `unique()` 工具 + `@faker-js/faker` 中文 locale）。
5. 迁移：`pnpm db:generate:mysql --name=<kebab>` 生成迁移文件（检查 `drizzle/mysql/` 下新生成的 SQL）→ `pnpm db:migrate:mysql` 应用 → 迁移文件随本次代码一起提交。
6. 按需填充演示数据：`NODE_ENV=development pnpm db:seed:mysql`。
7. 若项目使用 PostgreSQL：在 `src/database/pgsql/schemas/` 下用 pg-core（`pgTable` / `pgEnum`）做同样的事，工具函数来自 `@/database/pgsql/utils/*`，命令换成 `:pgsql` 后缀（迁移文件在 `drizzle/pgsql/`）。

`templates/schema.ts.tpl` 提供模板。详见 `reference/database.md`。

---

## 工作流 C：从零 bootstrap 新项目

```bash
bash .claude/skills/nest-scaffold/scripts/bootstrap.sh <target-dir> <APP_NAME>
# 示例
bash .claude/skills/nest-scaffold/scripts/bootstrap.sh ~/code/my-new-api my-new-api
```

脚本逻辑：

1. 把当前仓库（除 `node_modules` / `dist` / `coverage` / `.tmp` / `logs` / `.git`）拷贝到 `<target-dir>`。
2. 在目标目录里替换 `package.json` 的 `name`、`.env.example` 的 `APP_NAME` 等占位。
3. 重新 `git init`（不带原有提交历史）。
4. 输出后续手动步骤：`pnpm install` → `cp .env.example .env` → `docker compose up -d` → `pnpm db:migrate:mysql` → `NODE_ENV=development pnpm db:seed:mysql` → `pnpm start:dev`。

详见 `scripts/README.md`。

---

## Reference 索引

| 文件 | 内容 |
|------|------|
| `reference/workflows.md` | 开发生命周期工作流：新项目/新功能/修改/修 bug/数据库/文档六个场景的端到端流程 |
| `reference/task-acceptance.md` | 里程碑任务验收约定（四档 + PR 四件产物；计划不得削弱） |
| `reference/engineering-conventions.md` | 工程约定：通用不变量清单（审查逐条对照） |
| `reference/architecture.md` | 项目目录、模块依赖图、AppModule 装配顺序 |
| `reference/coding-standards.md` | TypeScript / 命名 / 函数 / 类 / 异常 / 接口规范 |
| `reference/module-development.md` | 业务模块组成、控制器/服务/仓储约定 |
| `reference/rest-api.md` | RESTful 规范、统一响应、CRUD 与 DTO 命名 |
| `reference/database.md` | Drizzle schema、BaseRepository、基础数据（数据迁移）/seed、事务 |
| `reference/infra-modules.md` | Cache / Queue / DistributedLock / Logger 用法与 Redis 连接约定 |
| `reference/testing.md` | Vitest / Testcontainers / useMocker / overrideProvider |
| `reference/git-commit.md` | Commitizen 风格、type/scope/body 语言规则、分支与推送规范 |
| `reference/env-vars.md` | 完整环境变量清单、默认值、配置注册方式 |

## Templates 索引

| 路径 | 内容 |
|------|------|
| `templates/feature-module/` | 业务模块完整骨架（controller/service/module/dtos/entities/repository/__tests__），含 `__feature__` / `__features__` / `__Feature__` / `__featureCamel__` / `__featuresCamel__` / `__FEATURE__` 占位符 |
| `templates/schema.ts.tpl` | Drizzle 表 schema 模板 |

## Scripts 索引

| 脚本 | 用途 |
|------|------|
| `scripts/bootstrap.sh` | 把本仓库克隆为新项目并替换 APP_NAME |
| `scripts/new-module.sh` | 在当前项目内生成新业务模块 |
| `scripts/setup-github.sh` | 配置 GitHub 分支保护 / Squash / auto-delete |

执行脚本前先 `chmod +x` 或 `bash <script>` 调用。

## Anti-Patterns（必避）

- 在控制器中写业务逻辑 / 直接调用仓储。控制器只负责参数校验、调用服务、组装响应。
- 在服务中拼装 SQL 字符串。一律使用 Drizzle 的查询构造器或 `BaseRepository` 提供的方法。
- 在长期运行的服务中调用 `unique()` / `uniqueArray()`。这两个函数有进程内 Map，**仅限 seed CLI 使用**。
- 业务里 `setTimeout` 做时序。改用 BullMQ 队列或 cron。
- 控制器返回未经 `Entity.create(raw)` 净化的 Drizzle 原始行（zod schema 会剔除未声明字段；直接返回原始行会泄露未声明字段，且时间格式不可控）。
- 在新业务里跑 `flushdb` / `cache.flush()`（会清空缓存专用 DB 的全部数据；cluster 模式下 `flush()` 会直接抛错拒绝）。
- 让缓存与锁/队列等不可丢数据的服务共用一个 Redis DB（缓存可随时清空/被淘汰，必须独立 DB；推荐 `CACHE_REDIS_DB=0` / `DISTRIBUTED_LOCK_REDIS_DB=1` / `QUEUE_REDIS_DB=2`）。
- 把 Redis client 直接共享给 BullMQ：BullMQ Worker 需要专用 blocking 连接，统一通过 `QueueModule` 接管。
- 在 `.env` 里直接写明文密码并提交。所有敏感字段都通过 redact 脱敏并保持 `.env` 不入库。
