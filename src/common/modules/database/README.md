# DatabaseModule

数据库模块入口，按数据库方言拆分为两套平行实现，项目按需二选一或同时导入：

- [`mysql/`](mysql/README.md) — 基于 Drizzle ORM + MySQL2，业务 Schema（`src/database/mysql/schemas`）与仓储层（`src/app/repositories/common/mysql`）均已实现，可直接使用。
- [`pgsql/`](pgsql/README.md) — 基于 Drizzle ORM + node-postgres，业务 Schema（`src/database/pgsql/schemas`）与仓储层（`src/app/repositories/common/pgsql`）均已实现，可直接使用。

两套实现各自完整、自包含（`database.module.ts` / `database.service.ts` / `common/types/*` / `tools/*` 均在各自目录内），互不依赖，方便脚手架按方言取舍其中一套。

## 共享部分（与方言无关，位于本目录）

| 路径                                        | 用途                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| `constants/database.tokens.ts`              | `DATABASE_INIT_INITIALIZER` / `DATABASE_SEEDER` Token       |
| `interfaces/init-initializer.interface.ts`  | `IInitInitializer`，init CLI 契约                            |
| `interfaces/seeder.interface.ts`            | `ISeeder`，seed CLI 契约                                     |
| `common/utils/unique.ts`                    | `unique` / `uniqueArray`，seed 脚本用的唯一值生成工具         |
| `common/types/not-empty-array.type.ts`      | 通用非空数组类型（与数据库方言无关）                          |

各方言的 `tools/`（`db:init` / `db:seed` CLI）复用以上 Token 与接口，绑定各自的 `DatabaseModule`。

## 选择哪一套

- 只用 MySQL：在 `AppModule` 中 `imports: [MysqlDatabaseModule]`（见 `mysql/README.md`）。当前脚手架默认使用 MySQL。
- 只用 PG：在 `AppModule` 中改为导入 `PgsqlDatabaseModule`（见 `pgsql/README.md`），业务仓储改继承 `src/app/repositories/common/pgsql/base.repository`。
- 两者都要：两个 `DatabaseModule` 分别以别名导入即可（均为 `@Global()`，`DatabaseService` 各自独立，不冲突）。
