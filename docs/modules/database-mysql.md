# DatabaseModule（MySQL）

源码：[mysql/](../../src/common/modules/database/mysql/)。业务 Schema、仓储和迁移约定见[数据库开发文档](../development/database.md)。

基于 Drizzle ORM + MySQL2 的数据库模块，提供连接管理与 Schema 绑定；seed CLI 由 `ToolsModule` 单独组合，不通过本模块注册。
与 [PostgreSQL](database-pgsql.md) 是平行的两套实现，见[数据库模块概览](database.md)了解共享部分。

## 功能特性

- `DatabaseService`：MySQL2 连接池 + Drizzle ORM 实例（绑定全部 Schema）
- 连接池生命周期管理：启动时自动验证连接、销毁时平滑关闭
- 开发环境自动输出参数化 SQL 查询日志
- `repositories/`：MySQL `BaseRepository`、错误映射和游标分页工具
- `@Global()` 静态模块：在根模块 `imports: [DatabaseModule]` 一次即可
- CLI 工具脚本（`ToolsModule`）：`db:seed:mysql`（演示数据）与 `db:reset:mysql`（重置到迁移基线），均仅限开发环境
- Seed 专用工具函数：`unique` / `uniqueArray` 确保生成唯一值

## 依赖

| 包               | 用途           |
| ---------------- | -------------- |
| `drizzle-orm`    | TypeScript ORM |
| `mysql2`         | MySQL 驱动     |
| `@nestjs/config` | 配置管理       |
| `nestjs-pino`    | 结构化日志     |

## 环境变量

在 `.env` 中配置，完整示例见 [.env.example](../../.env.example)，校验与默认值见 [mysql-database.config.ts](../../src/configs/mysql-database.config.ts)。

| 环境变量         | 要求 / 默认值          |
| ---------------- | ---------------------- |
| `MYSQL_DATABASE` | 必填，非空数据库名     |
| `MYSQL_USER`     | 必填，非空用户名       |
| `MYSQL_PASSWORD` | 必填，非空密码         |
| `MYSQL_HOST`     | 可选，默认 `127.0.0.1` |
| `MYSQL_PORT`     | 可选，默认 `3306`      |

## 快速开始

### 1. 在 AppModule 中注册一次（全局）

```typescript
import { DatabaseModule } from '@/common/modules/database/mysql/database.module';

@Module({
  imports: [DatabaseModule],
})
export class AppModule {}
```

### 2. 定义业务仓储

```typescript
import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import { BaseRepository } from '@/common/modules/database/mysql/repositories/base.repository';
import { demosSchema } from '@/database/mysql/schemas/demos.schema';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DemoRepository extends BaseRepository<typeof demosSchema> {
  constructor(private readonly _databaseService: DatabaseService) {
    super(demosSchema, _databaseService.db);
  }
}
```

业务模块通过 `RepositoryModule.forFeature([DemoRepository])` 按需注册。Service 不直接访问 `databaseService.db`；只有协调多个仓储的事务边界时才注入 `DatabaseService`。

### 3. 使用事务

在业务 Service 中协调事务，把同一个 `tx` 传给参与的仓储。导入类型后，在业务方法中执行下面的事务片段；假设用户与资料仓储已注入，`userData`、`profileData` 已按业务规则准备：

```typescript
import type { MySqlTransactionType } from '@/common/modules/database/mysql/common/types/mysql-transaction.type';

await this._databaseService.db.transaction(async (tx: MySqlTransactionType) => {
  await this._userRepository.create({ db: tx, data: userData });
  await this._profileRepository.create({ db: tx, data: profileData });
});
```

任一仓储抛错都会回滚。事务内所有相关调用都应显式传入 `db: tx`，更多约束见[事务与一致性](../development/database.md#事务与一致性)。

## CLI 工具

```bash
# 种子数据填充（faker 演示数据，仅限开发环境，NODE_ENV=production 会被拒绝）
NODE_ENV=development pnpm db:seed:mysql

# 表结构维护（Drizzle Kit migration，开发与生产同一套迁移文件）
pnpm db:generate:mysql --name=<kebab>   # schema 变更后生成迁移（务必带 --name，避免随机后缀）
pnpm db:migrate:mysql    # 应用迁移
```

### 基础数据与 seed 约定

基础数据（初始角色、系统配置等）用**自定义数据迁移**维护：`pnpm db:generate:mysql --custom --name=<name>` 生成空迁移文件后手写 INSERT 等 SQL（示例见 `drizzle/mysql/0001_base-data.sql`），随 `pnpm db:migrate:mysql` 一并应用。

`NODE_ENV=development pnpm db:reset:mysql` 会删除目标库全部表及迁移记录，再重放迁移恢复结构和基础数据，不会自动重新填充演示 seed。只对确认过的本地/测试库执行，交互确认不能代替检查连接目标；详见[数据重置约定](../development/database.md#基础数据seed-与-reset)。

种子器需实现对应接口：

```typescript
// src/database/mysql/seed.ts
import type { ISeeder } from '@/common/modules/database/interfaces/seeder.interface';

@Injectable()
export class SeedService implements ISeeder {
  async run(): Promise<void> {
    // 插入测试/演示数据
  }
}
```

## Seed 工具函数

`common/utils/unique.ts` 提供 `unique` 和 `uniqueArray`，用于在 seed 脚本中确保生成唯一值：

```typescript
import {
  unique,
  uniqueArray,
  clearUniqueCollections,
} from '@/common/modules/database/common/utils/unique';
import { faker } from '@faker-js/faker';

const email = await unique(() => faker.internet.email(), 'user-emails');
const tags = await uniqueArray(
  () => [faker.word.noun(), faker.word.noun()],
  'tag-pairs',
);

// seed 结束后清理内存
clearUniqueCollections();
```

> **注意**：这些函数使用模块级 Map 存储历史值，仅适用于 seed 等一次性 CLI 命令，**禁止在长期运行的服务中使用**。

## 类型导出

| 类型                   | 路径                                                                                                        | 用途                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- |
| `MySqlDatabaseType`    | [mysql-database.type.ts](../../src/common/modules/database/mysql/common/types/mysql-database.type.ts)       | Drizzle 数据库实例类型 |
| `MySqlTransactionType` | [mysql-transaction.type.ts](../../src/common/modules/database/mysql/common/types/mysql-transaction.type.ts) | 事务回调参数类型       |
| `NotEmptyArrayType<T>` | [not-empty-array.type.ts](../../src/common/modules/database/common/types/not-empty-array.type.ts)（共享）   | 非空数组约束类型       |

## 架构设计

```
┌───────────────────────────────────────────────────────┐
│                     DatabaseModule                     │
│                                                         │
│  ConfigModule (mysql-database.config)                  │
│           │                                             │
│           ▼                                             │
│  DatabaseService                                        │
│    - _pool: mysql2 Pool                                 │
│    - db: Drizzle<Schema>                                 │
│    - onModuleInit: ping 验证                              │
│    - onModuleDestroy: pool.end()                         │
│                                                         │
│  （seed Token 与 ToolsService 由 ToolsModule 注册，见 tools/） │
│                                                         │
│  exports: [DatabaseService]                             │
└───────────────────────────────────────────────────────┘
```
