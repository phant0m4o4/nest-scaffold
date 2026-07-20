# PgSQL DatabaseModule

基于 Drizzle ORM + node-postgres 的数据库模块，与 [`../mysql`](../mysql/README.md) 是平行的两套实现，按需二选一或同时导入。

## 功能特性

- `DatabaseService`：node-postgres 连接池 + Drizzle ORM 实例，绑定全部业务 Schema（`src/database/pgsql/schemas`）
- 连接池生命周期管理：启动时自动验证连接（`SELECT 1`）、销毁时优雅关闭
- 开发环境自动输出参数化 SQL 查询日志（`$n` 占位符内联）
- `tools/`：`db:init:pgsql` / `db:seed:pgsql` CLI（初始化与种子数据）
- `@Global()` 静态模块：在根模块 `imports: [DatabaseModule]` 一次即可

## 与 MySQL 版本的差异

- **主键**：`integer GENERATED ALWAYS AS IDENTITY`（MySQL 为 `int unsigned auto_increment`），见 `src/database/pgsql/utils/create-primary-key.ts`。
- **updatedAt**：PostgreSQL 没有 `ON UPDATE CURRENT_TIMESTAMP`，由 Drizzle 的 `$onUpdate` 在应用层写入（仅经由 Drizzle 的更新生效）。
- **枚举**：`pgEnum` 是独立的数据库类型（`CREATE TYPE`），需要在 schema 文件中声明并导出。
- **返回 id**：插入用 `.returning()`（MySQL 为 `$returningId()`），已在 `src/app/repositories/common/pgsql/base.repository.ts` 中封装。
- **错误码**：PG 走 SQLSTATE（唯一冲突 `23505`、外键 `23503` 等），由 `pgsql-error-mapper.util.ts` 映射为与 MySQL 版一致的领域异常。

## 依赖

| 包               | 用途             |
| ---------------- | ---------------- |
| `drizzle-orm`    | TypeScript ORM   |
| `pg`             | PostgreSQL 驱动  |
| `@nestjs/config` | 配置管理         |
| `nestjs-pino`    | 结构化日志       |

## 环境变量

在 `.env` 中配置：

```env
# 必填
PGSQL_DATABASE=my_database
PGSQL_USER=postgres
PGSQL_PASSWORD=123456

# 可选（有默认值）
PGSQL_HOST=127.0.0.1
PGSQL_PORT=5432
```

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

### 2. 注入使用

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
import { BaseRepository } from '@/app/repositories/common/pgsql/base.repository';

@Injectable()
export class DemoRepository extends BaseRepository<typeof demosSchema> {
  constructor(private readonly _databaseService: DatabaseService) {
    super(demosSchema, _databaseService.db);
  }
}
```

## 命令

| 命令 | 说明 |
| ---- | ---- |
| `pnpm db:push:pgsql` | 把 `src/database/pgsql/schemas/` 推到 PostgreSQL（开发用，无 migration 文件） |
| `pnpm db:generate:pgsql` / `pnpm db:migrate:pgsql` | migration 生成 / 执行（用户明确要求才用） |
| `NODE_ENV=development pnpm db:init:pgsql` / `NODE_ENV=production pnpm db:init:pgsql` | 跑 `InitService.run()`（`src/database/pgsql/init.ts`） |
| `NODE_ENV=development pnpm db:seed:pgsql` / `NODE_ENV=production pnpm db:seed:pgsql` | 跑 `SeedService.run()`（`src/database/pgsql/seed.ts`） |

Drizzle Kit 配置见根目录 `drizzle-pgsql.config.ts`。

## 类型导出

| 类型                  | 路径                                | 用途                   |
| --------------------- | ----------------------------------- | ---------------------- |
| `PgsqlDatabaseType`   | `common/types/pgsql-database.type`  | Drizzle 数据库实例类型 |
| `PgsqlTransactionType`| `common/types/pgsql-transaction.type` | 事务回调参数类型     |

## docker-compose

`docker-compose.yml` 中的 `postgres` / `pgadmin` 服务默认**不随 `mysql` / `phpmyadmin` 一起启动**（各自独立 service，按需 `docker compose up postgres pgadmin`）。
