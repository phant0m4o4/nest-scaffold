---
name: nest-scaffold
description: NestJS + Drizzle ORM + Redis/BullMQ/Pino 后端脚手架的开发规范与工具集。用于在本仓库或同款脚手架内开发业务模块（控制器/服务/DTO/Drizzle schema/仓储/测试），或基于本仓库从零 bootstrap 一个新项目。当用户提到“按本项目规范”“新建模块”“新增表/Schema”“写 Repository/Service/Controller/DTO”“写仓储或服务测试”“起一个 NestJS 脚手架”“bootstrap NestJS 项目”时使用。
---

# Nest Scaffold Skill

NestJS 11 + TypeScript 5 + Drizzle ORM (MySQL) + ioredis + BullMQ + nestjs-pino 的后端脚手架规范。

适用场景：

1. 在**本仓库或同款脚手架内**开发新业务模块、新 Drizzle 表、新仓储/服务/控制器、对应单元/E2E 测试。
2. 在新目录从零 **bootstrap** 一个同款脚手架，复用所有基础设施模块（Cache / Queue / DistributedLock / Redis / Logger / Database / I18n / Bottleneck）。

## 何时使用本 Skill

- 用户要"新增一个业务模块"、"新加一张表"、"写 Repository / Service / Controller"、"补单元/E2E 测试"。
- 用户要重构、补全、修改现有模块，需要遵循项目命名/分层/依赖注入/响应格式约定。
- 用户要起新项目，希望与本仓库一致：`docker-compose.yml`、`.env`、`AppModule`、`common/modules/*`、Drizzle 配置、Jest/Vitest、Commitizen、ESLint/Prettier 等。

## 核心约束（始终生效）

这些约束在任何操作前都必须遵守，违反时停止并向用户确认：

1. **包管理器只用 pnpm**。命令使用 `pnpm <script>`，不要用 npm/yarn。
2. **TypeScript 严禁 `any`**。需要时改用 `unknown` 或精确类型。
3. **目录与文件名一律 kebab-case + dots**：`user-profile.service.ts`、`access-key.module.ts`。`__tests__/` 是双下划线例外。
4. **类 PascalCase / 变量与方法 camelCase / 私有成员以 `_` 开头**。
5. **路径别名固定 `@/*` → `src/*`**。新代码中跨目录引用必须用 `@/`，不要写 `../../../`。
6. **每个文件只有一个导出**（默认导出或单一具名导出）。
7. **不主动生成 Drizzle migrations**（`db:generate` / `db:migrate`）；开发期使用 `pnpm db:push` 同步。
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
│   │   └── common/             # BaseRepository、Repository 异常、分页接口
│   └── app.module.ts
├── common/
│   ├── decorators/swagger/     # OkResponse / CursoredPaginationOkResponse / DtoSchema
│   ├── enums/                  # 跨模块通用枚举
│   ├── modules/                # 通用基础设施模块（全部 @Global()）
│   │   ├── bottleneck/ cache/ database/ distributed-lock/ i18n/ logger/ queue/ redis/
│   └── utils/                  # 通用工具：register-env-as-config、date-time、hash 等
├── configs/                    # 各模块的 ConfigModule（registerEnvAsConfig）
├── database/
│   ├── enums/                  # 跨表复用的枚举（camelCase 键值）
│   ├── schemas/                # Drizzle 表定义（每张表 *.schema.ts）
│   ├── schemas/index.ts        # 聚合导出
│   ├── utils/                  # createPrimaryKeyColumn / createTimestamps / createForeignKeyColumn
│   ├── init.ts                 # InitService（pnpm db:init）
│   └── seed.ts                 # SeedService（pnpm db:seed）
└── main.ts                     # 启用 enableShutdownHooks、Pino logger、Swagger（dev）、CORS
```

详细架构见 `reference/architecture.md`。

## 决策树：用户想做什么？

| 用户意图 | 工作流 | 详细参考 |
|---------|-------|---------|
| 新增业务模块（含 controller/service/dto/repository/tests） | 见下方"工作流 A" | `reference/module-development.md` + `reference/rest-api.md` |
| 新增一张数据库表 | 见下方"工作流 B" | `reference/database.md` |
| 写/改测试（Jest 或 Vitest） | 见 `reference/testing.md` | `reference/testing.md` |
| 使用 Cache / Queue / DistributedLock / Redis / Logger | 看对应模块 README + 见 `reference/infra-modules.md` | `reference/infra-modules.md` |
| 加配置（环境变量） | 在 `src/configs/<name>.config.ts` 写 `EnvironmentVariables` 类 + `registerEnvAsConfig` | `reference/env-vars.md` |
| 写 commit message | 见 `reference/git-commit.md` | `reference/git-commit.md` |
| 从零 bootstrap 新项目 | 运行 `scripts/bootstrap.sh <target-dir> <APP_NAME>` | `scripts/README.md` |

---

## 工作流 A：新增业务模块

**目标**：在 `src/app/api/<domain>/` 下生成完整自包含的业务模块。

### 推荐方式：使用脚本

在仓库根目录执行：

```bash
bash .cursor/skills/nest-scaffold/scripts/new-module.sh <domain-kebab>
# 示例
bash .cursor/skills/nest-scaffold/scripts/new-module.sh user-profile
```

脚本会按本仓库约定生成完整目录骨架（controller/service/module/dtos/entities/repository/__tests__），并替换占位符。

生成后必须做的人工步骤：

1. 在 `src/database/schemas/` 增加对应表（如尚未存在）并在 `schemas/index.ts` 导出。
2. 在 `<Feature>Repository` 中确认表名、特殊查询方法。
3. 在 `<Feature>Service` 中实现真实业务逻辑（脚本只生成 CRUD 桩）。
4. 在 `src/app/api/api.module.ts` 中 `imports` 新模块。
5. `pnpm lint && pnpm build` 验证；按需 `pnpm test` / `pnpm test:e2e`。

### 手写时的最小骨架

如果需要手写（例如脚本不可用），请严格参照以下要点：

- 控制器统一返回 `{ data?, meta? }`，由 `GlobalResponseInterceptor` 包装为 `{ statusCode, data?, meta? }`。
- CRUD 方法名固定：`create` / `findOne` / `findMany` / `findManyByCursorPagination` / `update` / `remove` / `findAll`。
- DTO 一律放 `dtos/` 下，命名 `create-<feature>-request.dto.ts`、`update-<feature>-request.dto.ts`、`find-many-<feature>-request.dto.ts`、`find-one-<feature>-param.dto.ts`、`<feature>-response.dto.ts`（实体可放 `entities/<feature>.entity.ts`）。
- DTO 类用 `@DtoSchema({ name: 'app.api.<domain>.dtos.<dto-name>' })` 装饰，确保 Swagger 模型唯一。
- 所有响应 DTO 字段加 `@Expose()`，控制器返回时用 `plainToInstance(EntityClass, raw, { excludeExtraneousValues: true })`。
- 控制器方法上挂 Swagger 装饰器：`@OkResponse(Entity)` / `@CreatedResponse(Entity)` / `@CursoredPaginationOkResponse(Entity)` / `@ArrayOkResponse(Entity)`。
- Service 注入仓储；分页查询从 `BaseRepository` 继承的 `findManyWithCursorPagination` / `findManyWithPagination` 调用。
- `<Feature>Module` 通过 `RepositoryModule.forFeature([<Feature>Repository])` 注册仓储。

完整模板见 `templates/feature-module/`，详细规范见 `reference/module-development.md` 与 `reference/rest-api.md`。

---

## 工作流 B：新增数据库表

1. 在 `src/database/enums/` 决定是否需要枚举（跨文件复用才放这里，键值用 camelCase）。
2. 在 `src/database/schemas/<table-name>.schema.ts` 用 Drizzle MySQL 定义：
   - 必须 `id: createPrimaryKeyColumn()`（来自 `@/database/utils/create-primary-key`）。
   - 时间戳用 `...createTimestamps()`，需要软删除则 `...createTimestampsWithSoftDelete()`（自动生成 `deletedAt`，`BaseRepository` 会识别）。
   - 外键用 `createForeignKeyColumn()`。
3. 在 `src/database/schemas/index.ts` 重导出新 schema。
4. 必要时更新 `src/database/init.ts`（基础数据）和 `src/database/seed.ts`（演示数据，使用 `unique()` 工具 + `@faker-js/faker` 中文 locale）。
5. 同步：`pnpm db:push` → `pnpm db:init:dev` → `pnpm db:seed:dev`。
6. **不要**主动跑 `db:generate` / `db:migrate`，除非用户明确要求 migration。

`templates/schema.ts.tpl` 提供模板。详见 `reference/database.md`。

---

## 工作流 C：从零 bootstrap 新项目

```bash
bash .cursor/skills/nest-scaffold/scripts/bootstrap.sh <target-dir> <APP_NAME>
# 示例
bash .cursor/skills/nest-scaffold/scripts/bootstrap.sh ~/code/my-new-api my-new-api
```

脚本逻辑：

1. 把当前仓库（除 `node_modules` / `dist` / `coverage` / `.tmp` / `logs` / `.git`）拷贝到 `<target-dir>`。
2. 在目标目录里替换 `package.json` 的 `name`、`.env.example` 的 `APP_NAME` 等占位。
3. 重新 `git init`（不带原有提交历史）。
4. 输出后续手动步骤：`pnpm install` → `cp .env.example .env` → `docker compose up -d` → `pnpm db:push && pnpm db:init:dev && pnpm db:seed:dev` → `pnpm start:dev`。

详见 `scripts/README.md`。

---

## Reference 索引

| 文件 | 内容 |
|------|------|
| `reference/architecture.md` | 项目目录、模块依赖图、AppModule 装配顺序 |
| `reference/coding-standards.md` | TypeScript / 命名 / 函数 / 类 / 异常 / 接口规范 |
| `reference/module-development.md` | 业务模块组成、控制器/服务/仓储约定 |
| `reference/rest-api.md` | RESTful 规范、统一响应、CRUD 与 DTO 命名 |
| `reference/database.md` | Drizzle schema、BaseRepository、init/seed、事务 |
| `reference/infra-modules.md` | Cache / Queue / DistributedLock / Redis / Logger 用法 |
| `reference/testing.md` | Jest / Vitest / Testcontainers / useMocker / overrideProvider |
| `reference/git-commit.md` | Commitizen 风格、type/scope/body 语言规则 |
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

执行脚本前先 `chmod +x` 或 `bash <script>` 调用。

## Anti-Patterns（必避）

- 在控制器中写业务逻辑 / 直接调用仓储。控制器只负责参数校验、调用服务、组装响应。
- 在服务中拼装 SQL 字符串。一律使用 Drizzle 的查询构造器或 `BaseRepository` 提供的方法。
- 在长期运行的服务中调用 `unique()` / `uniqueArray()`。这两个函数有进程内 Map，**仅限 seed CLI 使用**。
- 业务里 `setTimeout` 做时序。改用 BullMQ 队列或 cron。
- 控制器返回未经 `plainToInstance(... { excludeExtraneousValues: true })` 净化的 Drizzle 原始行（会泄露未声明字段，且时间格式不可控）。
- 在新业务里跑 `flushdb` / `cache.flush()`（会清空整库 Redis 数据）。
- 把 Redis client 直接共享给 BullMQ：BullMQ Worker 需要专用 blocking 连接，统一通过 `QueueModule` 接管。
- 在 `.env` 里直接写明文密码并提交。所有敏感字段都通过 redact 脱敏并保持 `.env` 不入库。
