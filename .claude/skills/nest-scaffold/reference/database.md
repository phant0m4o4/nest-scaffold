# 数据库（Drizzle ORM + MySQL / PostgreSQL）

> 项目提供 MySQL（`src/common/modules/database/mysql/`）与 PostgreSQL（`src/common/modules/database/pgsql/`）两套平行、各自完整的实现（连接层 + 业务 Schema + 仓储基类 + init/seed CLI），按需二选一或同时导入，见 `src/common/modules/database/README.md`。**脚手架默认启用 MySQL**（`AppModule` 导入的是 mysql 版 `DatabaseModule`）。
> 本文以 MySQL 版为主线，PG 版差异集中在「PostgreSQL 版差异」一节。

## 关键约束

- 表必须有 `id` 整型主键列（MySQL：bigint unsigned auto-increment；PG：bigint generated always as identity（drizzle `mode: 'number'`，JS 侧为普通 number）），由各自的 `createPrimaryKeyColumn()` 提供。否则 `BaseRepository` 启动会抛错。
- 软删除以 `deletedAt: timestamp()` 列约定，由 `BaseRepository` 自动识别。
- 所有 schema 在 `src/database/<dialect>/schemas/<table>.schema.ts`（`<dialect>` 为 `mysql` 或 `pgsql`），并在 `schemas/index.ts` 用 `export * from './<table>.schema'` 聚合。
- 跨表枚举放 `src/database/enums/`（方言无关，两套 schema 共享），**键和值都用 camelCase**。仅当前文件用就就地定义。
- **不主动生成 migration**。开发期 `pnpm db:push:mysql`（MySQL）/ `pnpm db:push:pgsql`（PG）即可。**push 仅限开发**：生产环境的表结构变更一律走 migration（`db:generate:*` 生成并入库 → 生产执行 `db:migrate:*`），禁止对生产库 push。

## Schema 写法

```ts
import { foreignKey, mysqlEnum, mysqlTable, unique, varchar } from 'drizzle-orm/mysql-core';
import { DemoTypeEnum, demoTypes } from '../enums/demo-type.enum';
import { createForeignKeyColumn } from '../utils/create-foreign-key';
import { createPrimaryKeyColumn } from '../utils/create-primary-key';
import { createTimestamps } from '../utils/create-time-stamps';

export const demosSchema = mysqlTable(
  'demos',
  {
    id: createPrimaryKeyColumn(),
    name: varchar({ length: 100 }).notNull(),
    type: mysqlEnum(demoTypes).notNull().default(DemoTypeEnum.type1),
    parentId: createForeignKeyColumn(),
    ...createTimestamps(),                     // createdAt + updatedAt
    // 启用软删除则用 ...createTimestampsWithSoftDelete()
  },
  (table) => [
    unique().on(table.name),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: 'parent_id_fk',
    }),
  ],
);
```

工具函数（位于 `src/database/mysql/utils/`）：

| 函数 | 说明 |
|------|------|
| `createPrimaryKeyColumn(name?)` | 默认生成 `bigint unsigned not null auto_increment primary key`（`mode: 'number'`），自定义列名时传参 |
| `createForeignKeyColumn(name?)` | 生成可空的外键列（bigint unsigned，与主键类型一致），约束在 schema 第 3 个参数声明 |
| `createTimestamps()` | `{ createdAt, updatedAt }` 默认 now、`onUpdateNow()` |
| `createTimestampsWithSoftDelete()` | 额外加 `deletedAt: timestamp()` |

## PostgreSQL 版差异

Schema 写法与 MySQL 版一致，仅方言 API 不同（`src/database/pgsql/`）：

```ts
import { foreignKey, pgEnum, pgTable, unique, varchar } from 'drizzle-orm/pg-core';

// PG 枚举是独立数据库类型，需声明并导出（drizzle-kit 依赖导出生成 CREATE TYPE）
export const demoTypeEnum = pgEnum('demo_type', demoTypes);

export const demosSchema = pgTable('demos', {
  id: createPrimaryKeyColumn(),            // bigint generated always as identity
  name: varchar({ length: 100 }).notNull(),
  type: demoTypeEnum().notNull().default(DemoTypeEnum.type1),
  parentId: createForeignKeyColumn(),
  ...createTimestamps(),
}, (table) => [ /* 同 MySQL 版 */ ]);
```

要点：

- 工具函数来自 `src/database/pgsql/utils/`，签名与 MySQL 版一致。
- `updatedAt` 用 Drizzle `$onUpdate` 在应用层写入（PG 无 `ON UPDATE CURRENT_TIMESTAMP`）。
- 仓储基类：`src/app/repositories/common/pgsql/base.repository.ts`（API 与 MySQL 版完全一致）；错误映射走 PG SQLSTATE（`mapPgsqlErrorAndThrow`：23505 唯一冲突、23503 外键、40P01 死锁、55P03 锁不可用、23502/22001/22P02 数据完整性）。
- 事务类型：`PgsqlTransactionType`（`@/common/modules/database/pgsql/common/types/pgsql-transaction.type`）。
- init/seed：`src/database/pgsql/init.ts` / `seed.ts`，命令为 `NODE_ENV=development pnpm db:init:pgsql` / `NODE_ENV=development pnpm db:seed:pgsql`。
- Drizzle Kit：`drizzle-pgsql.config.ts`，命令统一带 `:pgsql` 后缀（见下方命令表）。
- `.env`：`PGSQL_HOST` / `PGSQL_PORT` / `PGSQL_DATABASE` / `PGSQL_USER` / `PGSQL_PASSWORD`（`${APP_NAME}` 占位同样生效）。

## 命名

- 表名：复数小写下划线（drizzle 默认）。如 `demos`、`access_keys`、`user_profiles`。
- Schema 变量：`<tableName>Schema`（小驼峰）。
- 文件：`<table-name>.schema.ts`（kebab-case）。

## Repository

业务仓储继承 `BaseRepository`，见 `module-development.md`。

`BaseRepository` 提供的能力概览：

- `findOne({ db?, id })`
- `findAll({ db?, order? })`
- `findMany({ db?, filter?, limit?, order? })`
- `findManyWithPagination({ db?, page, pageSize, filter?, order? })`
- `findManyWithCursorPagination({ db?, limit, cursor?, filter?, order? })`
- `create({ db?, data })`、`batchCreate({ db?, data })`
- `update({ db?, id, data })`
- `delete({ db?, id })`、`batchDelete({ db?, ids })`
- `isExists({ db?, filters })`、`count({ db?, filter? })`

参数全部是 RO（receive object），`db` 参数用于事务复用。

排序：`order: { column: 'createdAt', direction: 'desc' }` 或多列 `[{ column, direction }, ...]`，列必须是 schema 中存在的列名，否则抛错。

## 事务

```ts
import type { MySqlTransactionType } from '@/common/modules/database/mysql/common/types/mysql-transaction.type';

await this._databaseService.db.transaction(async (tx: MySqlTransactionType) => {
  await this._userRepository.create({ db: tx, data: userData });
  await this._walletRepository.create({ db: tx, data: walletData });
});
```

抛出异常自动回滚。所有仓储方法接受 `db?` 参数，传入 `tx` 即可在事务内执行。

## 异常映射

仓储调用 `mapMysqlErrorAndThrow(error)` 自动把 mysql2 `code` 翻译成：

| MySQL 错误 | 业务异常 |
|-----------|---------|
| `ER_DUP_ENTRY` (1062) | `RecordAlreadyExistsException` |
| `ER_NO_REFERENCED_ROW` (1452) / `ER_ROW_IS_REFERENCED` (1451) | `ForeignKeyConstraintViolationException` |
| `ER_LOCK_DEADLOCK` (1213) | `DeadlockDetectedException` |
| `ER_LOCK_WAIT_TIMEOUT` (1205) | `LockWaitTimeoutException` |
| 非空/长度/非法值 (1048/1366/1406) | `DataIntegrityViolationException` |
| 其他 | `RepositoryException` |

业务调用方只需 catch 这些类。

## init / seed

`src/database/mysql/init.ts` 实现 `IInitInitializer.run()`，由 `NODE_ENV=development pnpm db:init:mysql`（开发） / `NODE_ENV=production pnpm db:init:mysql`（生产，需先 `pnpm build`）触发。用于：基础数据、必备角色、系统配置等。

`src/database/mysql/seed.ts` 实现 `ISeeder.run()`，由 `pnpm db:seed:*` 触发，用于演示/测试数据。**仅限开发/测试环境**：`NODE_ENV=production` 下 `bootstrapTool` 会直接拒绝执行。

两者都通过 inquirer 二次确认：

```ts
const answer = await inquirer.prompt([
  { type: 'confirm', name: 'continue', message: '即将...是否继续?', default: false },
]);
if (!answer.continue) return;
```

### Seed 工具

`src/common/modules/database/common/utils/unique.ts` 提供：

```ts
import { unique, uniqueArray, clearUniqueCollections } from '@/common/modules/database/common/utils/unique';
import { fakerZH_CN as faker } from '@faker-js/faker';

const name = await unique(() => faker.person.fullName(), 'demos');
const tags = await uniqueArray(() => [faker.word.noun(), faker.word.noun()], 'tag-pairs');

// seed 结束清理内存
clearUniqueCollections();
```

⚠️ `unique` 用模块级 Map 缓存，**仅限 seed 这种一次性 CLI 用**。在长期运行的服务里调用会内存泄漏。

## 命令

| 命令（MySQL / PostgreSQL） | 说明 |
|------|------|
| `pnpm db:push:mysql` / `pnpm db:push:pgsql` | 把 `src/database/<dialect>/schemas/` 推到数据库（**仅限开发**，无 migration 文件，禁止用于生产） |
| `pnpm db:generate:mysql` / `pnpm db:generate:pgsql` | 生成 migration 文件（**用户明确要求才用**） |
| `pnpm db:migrate:mysql` / `pnpm db:migrate:pgsql` | 执行 migration（**用户明确要求才用**） |
| `NODE_ENV=development pnpm db:init:mysql` / `NODE_ENV=development pnpm db:init:pgsql`（prod 同理） | 跑 `InitService.run()` |
| `NODE_ENV=development pnpm db:seed:mysql` / `NODE_ENV=development pnpm db:seed:pgsql`（仅开发，生产环境会被拒绝） | 跑 `SeedService.run()` |

## .env

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=${APP_NAME}    # drizzle-mysql.config.ts 会把 ${APP_NAME} 替换为 process.env.APP_NAME
MYSQL_USER=root
MYSQL_PASSWORD=root_password

# PostgreSQL（使用 pgsql 版时）
PGSQL_HOST=127.0.0.1
PGSQL_PORT=5432
PGSQL_DATABASE=${APP_NAME}
PGSQL_USER=postgres
PGSQL_PASSWORD=root_password
```

`drizzle-mysql.config.ts` / `drizzle-pgsql.config.ts` 通过 `process.env.*_DATABASE.replace('${APP_NAME}', process.env.APP_NAME)` 实现动态库名。

## docker-compose

`docker-compose.yml` 包含：

- `mysql:8.0`（端口 3306，命令 `--character-set-server=utf8mb4 --collation-server=utf8mb4_general_ci`）
- `phpmyadmin`（端口 8081）
- `postgres:16`（端口 5432，仅在需要 PG 时用；见 `PGSQL_*` 环境变量）
- `pgadmin`（端口 8082）
- `redis`（端口 6379，`requirepass`）
- `phpRedisAdmin`（端口 8080）

容器名带 `${APP_NAME}-` 前缀，启动用 `docker compose -p ${APP_NAME} up -d`。
