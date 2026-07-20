# PgSQL DatabaseModule

基于 Drizzle ORM + node-postgres 的数据库模块，与 [`../mysql`](../mysql/README.md) 是平行的两套实现，按需二选一或同时导入。

## 功能特性

- `DatabaseService`：node-postgres 连接池 + Drizzle ORM 实例
- 连接池生命周期管理：启动时自动验证连接（`SELECT 1`）、销毁时优雅关闭
- 开发环境自动输出参数化 SQL 查询日志（`$n` 占位符内联）
- `@Global()` 静态模块：在根模块 `imports: [DatabaseModule]` 一次即可

## 与 MySQL 版本的差异（现状）

- **尚未绑定业务 Schema**：`src/database/schemas` 下现有 Schema 均基于 `drizzle-orm/mysql-core`，无法直接给 PG 用。新增 pg-core Schema（`pgTable` 等）后，参照 `mysql/database.service.ts` 把 `schema` 传入 `drizzle({ client, schema })` 即可获得类型化 `db.query.*`。
- **暂无 init/seed CLI**：`../mysql/tools/` 下的 `db:init` / `db:seed` 脚本绑定的是 `src/database/init.ts` / `seed.ts`（MySQL 业务数据）。PG 侧待有业务 Schema 后，可复制 `mysql/tools/` 目录结构（`bootstrap-tool.ts` / `*.main.ts` / `tools.module.ts` / `tools.service.ts`）并指向自己的 `IInitInitializer` / `ISeeder` 实现。
- **仓储层（`BaseRepository`）仍是 MySQL 专属**：其类型约束在 `MySqlTable`/`MySqlDatabaseType`，且依赖 `$returningId()` 等 MySQL 专属 API，`mysql-error-mapper.util.ts` 的错误码也是 MySQL 专属（`ER_xxx`）。PG 版仓储基类需要单独实现（PG 错误码走 `error.code`，如唯一冲突 `23505`、外键冲突 `23503`），本次未包含在改造范围内。

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

## 类型导出

| 类型                  | 路径                                | 用途                   |
| --------------------- | ----------------------------------- | ---------------------- |
| `PgsqlDatabaseType`   | `common/types/pgsql-database.type`  | Drizzle 数据库实例类型 |
| `PgsqlTransactionType`| `common/types/pgsql-transaction.type` | 事务回调参数类型     |

## docker-compose

`docker-compose.yml` 中的 `postgres` / `pgadmin` 服务默认**不随 `mysql` / `phpmyadmin` 一起启动**（各自独立 service，按需 `docker compose up postgres pgadmin`）。
