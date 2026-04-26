# 数据库（Drizzle ORM + MySQL）

## 关键约束

- 表必须有 `id` 列（int unsigned auto-increment primary key），由 `createPrimaryKeyColumn()` 提供。否则 `BaseRepository` 启动会抛错。
- 软删除以 `deletedAt: timestamp()` 列约定，由 `BaseRepository` 自动识别。
- 所有 schema 在 `src/database/schemas/<table>.schema.ts`，并在 `schemas/index.ts` 用 `export * from './<table>.schema'` 聚合。
- 跨表枚举放 `src/database/enums/`，**键和值都用 camelCase**。仅当前文件用就就地定义。
- **不主动生成 migration**。开发期 `pnpm db:push` 即可。

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

工具函数（位于 `src/database/utils/`）：

| 函数 | 说明 |
|------|------|
| `createPrimaryKeyColumn(name?)` | 默认生成 `int unsigned not null auto_increment primary key`，自定义列名时传参 |
| `createForeignKeyColumn(name?)` | 生成可空的外键列（int unsigned），约束在 schema 第 3 个参数声明 |
| `createTimestamps()` | `{ createdAt, updatedAt }` 默认 now、`onUpdateNow()` |
| `createTimestampsWithSoftDelete()` | 额外加 `deletedAt: timestamp()` |

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
import type { MySqlTransactionType } from '@/common/modules/database/common/types/mysql-transaction.type';

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
| 其他 | `RepositoryException` |

业务调用方只需 catch 这些类。

## init / seed

`src/database/init.ts` 实现 `IInitInitializer.run()`，由 `pnpm db:init:dev`（开发） / `pnpm db:init:prod`（生产，需先 `pnpm build`）触发。用于：基础数据、必备角色、系统配置等。

`src/database/seed.ts` 实现 `ISeeder.run()`，由 `pnpm db:seed:*` 触发，用于演示/测试数据。

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

| 命令 | 说明 |
|------|------|
| `pnpm db:push` | 把 `src/database/schemas/` 推到 MySQL（开发用，无 migration 文件） |
| `pnpm db:generate` | 生成 migration 文件（**用户明确要求才用**） |
| `pnpm db:migrate` | 执行 migration（**用户明确要求才用**） |
| `pnpm db:init:dev` / `pnpm db:init:prod` | 跑 `InitService.run()` |
| `pnpm db:seed:dev` / `pnpm db:seed:prod` | 跑 `SeedService.run()` |

## .env

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=${APP_NAME}    # drizzle.config.ts 会把 ${APP_NAME} 替换为 process.env.APP_NAME
MYSQL_USER=root
MYSQL_PASSWORD=root_password
```

`drizzle.config.ts` 通过 `process.env.MYSQL_DATABASE.replace('${APP_NAME}', process.env.APP_NAME)` 实现动态库名。

## docker-compose

`docker-compose.yml` 包含：

- `mysql:8.0`（端口 3306，命令 `--character-set-server=utf8mb4 --collation-server=utf8mb4_general_ci`）
- `phpmyadmin`（端口 8080）
- `redis`（端口 6379，`requirepass`）
- `phpRedisAdmin`（端口 8081）

容器名带 `${APP_NAME}-` 前缀，启动用 `docker compose -p ${APP_NAME} up -d`。
