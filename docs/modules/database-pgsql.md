# PgSQL DatabaseModule

源码：[pgsql/](../../src/common/modules/database/pgsql/)。业务 Schema、仓储和迁移约定见[数据库开发文档](../development/database.md)。

基于 Drizzle ORM + node-postgres 的数据库模块，与 [MySQL](database-mysql.md) 是平行的两套实现，按需二选一或同时导入。共享部分见[数据库模块概览](database.md)。

## 功能特性

- `DatabaseService`：node-postgres 连接池 + Drizzle ORM 实例，绑定全部业务 Schema（`src/database/pgsql/schemas`）
- 连接池生命周期管理：启动时自动验证连接（`SELECT 1`）、销毁时平滑关闭
- 空闲连接异常记录 `db_pool_error`，由驱动移除故障连接，后续查询按需创建新连接；不自动重试已失败的业务查询或事务
- 开发环境自动输出参数化 SQL 查询日志（`$n` 占位符内联）
- `tools/`：`db:seed:pgsql`（种子数据）与 `db:reset:pgsql`（重置到迁移基线）CLI，均仅限开发环境
- `@Global()` 静态模块：在根模块 `imports: [DatabaseModule]` 一次即可

## 与 MySQL 版本的差异

- **主键**：`bigint GENERATED ALWAYS AS IDENTITY`（MySQL 为 `bigint unsigned auto_increment`），见 `src/database/pgsql/utils/create-primary-key.ts`。
- **updatedAt**：PostgreSQL 没有 `ON UPDATE CURRENT_TIMESTAMP`，由 Drizzle 的 `$onUpdate` 在应用层写入（仅经由 Drizzle 的更新生效）。
- **枚举**：`pgEnum` 是独立的数据库类型（`CREATE TYPE`），需要在 schema 文件中声明并导出。
- **返回 id**：插入用 `.returning()`（MySQL 为 `$returningId()`），已在 `src/common/modules/database/pgsql/repositories/base.repository.ts` 中封装。
- **错误码**：PG 走 SQLSTATE（唯一冲突 `23505`、外键 `23503` 等），由 `pgsql-error-mapper.util.ts` 映射为与 MySQL 版一致的领域异常。

## 依赖

| 包               | 用途            |
| ---------------- | --------------- |
| `drizzle-orm`    | TypeScript ORM  |
| `pg`             | PostgreSQL 驱动 |
| `@nestjs/config` | 配置管理        |
| `nestjs-pino`    | 结构化日志      |

## 环境变量

在 `.env` 中配置，完整示例见 [.env.example](../../.env.example)，校验与默认值见 [pgsql-database.config.ts](../../src/configs/pgsql-database.config.ts)。

| 环境变量         | 要求 / 默认值          |
| ---------------- | ---------------------- |
| `PGSQL_DATABASE` | 必填，非空数据库名     |
| `PGSQL_USER`     | 必填，非空用户名       |
| `PGSQL_PASSWORD` | 必填，非空密码         |
| `PGSQL_HOST`     | 可选，默认 `127.0.0.1` |
| `PGSQL_PORT`     | 可选，默认 `5432`      |

## 快速开始

### 1. 在 AppModule 中注册一次（全局）

```typescript
import { DatabaseModule as PgsqlDatabaseModule } from '@/common/modules/database/pgsql/database.module';

@Module({
  imports: [PgsqlDatabaseModule],
})
export class AppModule {}
```

> 若同一应用需要同时使用 MySQL 与 PG，两个 `DatabaseModule` 分别 `import` 时建议用别名区分（如上例）。

### 2. 注入使用（基础设施示例）

以下代码仅演示直接访问数据库的方式。业务查询应通过仓储封装，业务 Service 只在协调事务时注入 `DatabaseService`。

```typescript
import { DatabaseService } from '@/common/modules/database/pgsql/database.service';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

@Injectable()
export class SomeService {
  constructor(private readonly _databaseService: DatabaseService) {}

  async ping() {
    return await this._databaseService.db.execute(sql`select 1`);
  }
}
```

### 3. 使用事务

```typescript
import type { PgsqlTransactionType } from '@/common/modules/database/pgsql/common/types/pgsql-transaction.type';

await this._databaseService.db.transaction(async (tx: PgsqlTransactionType) => {
  // ...
});
```

### 4. 定义业务仓储

```typescript
import { DatabaseService } from '@/common/modules/database/pgsql/database.service';
import { demosSchema } from '@/database/pgsql/schemas/demos.schema';
import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/common/modules/database/pgsql/repositories/base.repository';

@Injectable()
export class DemoRepository extends BaseRepository<typeof demosSchema> {
  constructor(private readonly _databaseService: DatabaseService) {
    super(demosSchema, _databaseService.db);
  }
}
```

## 命令

| 命令                                                                   | 说明                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm db:generate:pgsql --name=<kebab>`                                | schema 变更后生成 migration（务必带 `--name`，避免随机后缀）    |
| `pnpm db:migrate:pgsql`                                                | 应用 migration（开发与生产统一方式）                            |
| `NODE_ENV=development pnpm db:seed:pgsql`（仅开发，生产环境会被拒绝）  | 跑 `SeedService.run()`（`src/database/pgsql/seed.ts`）          |
| `NODE_ENV=development pnpm db:reset:pgsql`（仅开发，生产环境会被拒绝） | 重置到迁移基线：重建 public schema 并清除迁移记录后重放所有迁移 |

Drizzle Kit 配置见 [drizzle-pgsql.config.ts](../../drizzle-pgsql.config.ts)。`reset` 只对确认过的本地/测试库执行：它会删除 `public` 和 `drizzle` schema 后重放迁移，不会恢复原有 schema 属主、默认授权或演示 seed；连接角色需要相应权限。命令直接重置这两个 schema，但 `CASCADE` 也可能删除其他 schema 中依赖它们的对象。

## 类型导出

| 类型                   | 路径                                                                                                        | 用途                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- |
| `PgsqlDatabaseType`    | [pgsql-database.type.ts](../../src/common/modules/database/pgsql/common/types/pgsql-database.type.ts)       | Drizzle 数据库实例类型 |
| `PgsqlTransactionType` | [pgsql-transaction.type.ts](../../src/common/modules/database/pgsql/common/types/pgsql-transaction.type.ts) | 事务回调参数类型       |

## docker-compose

[docker-compose.yml](../../docker-compose.yml) 中的 `postgres` / `pgadmin` 服务会随 `docker compose up -d` 与 MySQL 一并启动；用 `docker compose up -d postgres pgadmin` 可只启动指定服务，避免运行项目不需要的数据库。
