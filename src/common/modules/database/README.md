# DatabaseModule

基于 Drizzle ORM + MySQL2 的数据库模块，提供连接管理与 Schema 绑定；init/seed CLI 由 `ToolsModule` 单独组合，不通过本模块注册。

## 功能特性

- `DatabaseService`：MySQL2 连接池 + Drizzle ORM 实例（绑定全部 Schema）
- 连接池生命周期管理：启动时自动验证连接、销毁时优雅关闭
- 开发环境自动输出参数化 SQL 查询日志
- `@Global()` 静态模块：在根模块 `imports: [DatabaseModule]` 一次即可
- CLI 工具脚本（`ToolsModule`）：`db:init` / `db:seed`，在工具模块内注册 `InitService` / `SeedService` 与 Token
- Seed 专用工具函数：`unique` / `uniqueArray` 确保生成唯一值

## 依赖

| 包               | 用途           |
| ---------------- | -------------- |
| `drizzle-orm`    | TypeScript ORM |
| `mysql2`         | MySQL 驱动     |
| `@nestjs/config` | 配置管理       |
| `nestjs-pino`    | 结构化日志     |

## 环境变量

在 `.env` 中配置：

```env
# 必填
MYSQL_DATABASE=my_database
MYSQL_USER=root
MYSQL_PASSWORD=123456

# 可选（有默认值）
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
```

## 快速开始

### 1. 在 AppModule 中注册一次（全局）

```typescript
import { DatabaseModule } from '@/common/modules/database/database.module';

@Module({
  imports: [DatabaseModule],
})
export class AppModule {}
```

### 2. 在 Repository / Service 中使用

```typescript
import { DatabaseService } from '@/common/modules/database/database.service';
import { demos } from '@/database/schemas';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

@Injectable()
export class DemoRepository {
  constructor(private readonly _databaseService: DatabaseService) {}

  async findById(id: number) {
    return await this._databaseService.db.query.demos.findFirst({
      where: eq(demos.id, id),
    });
  }
}
```

### 3. 使用事务

```typescript
import type { MySqlTransactionType } from '@/common/modules/database/common/types/mysql-transaction.type';

async transferFunds(fromId: number, toId: number, amount: number) {
  await this._databaseService.db.transaction(async (tx: MySqlTransactionType) => {
    await tx.update(accounts).set({ balance: sql`balance - ${amount}` }).where(eq(accounts.id, fromId));
    await tx.update(accounts).set({ balance: sql`balance + ${amount}` }).where(eq(accounts.id, toId));
  });
}
```

## CLI 工具

```bash
# 数据库结构初始化
pnpm db:init:dev    # 开发环境
pnpm db:init:prod   # 生产环境

# 种子数据填充
pnpm db:seed:dev    # 开发环境
pnpm db:seed:prod   # 生产环境

# 表结构同步（Drizzle Kit）
pnpm db:push
```

### init/seed 实现约定

初始化器和种子器需实现对应接口：

```typescript
// src/database/init.ts
import type { IInitInitializer } from '@/common/modules/database/interfaces/init-initializer.interface';

@Injectable()
export class InitService implements IInitInitializer {
  async run(): Promise<void> {
    // 创建初始角色、权限等基础数据
  }
}

// src/database/seed.ts
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

| 类型                   | 路径                                  | 用途                   |
| ---------------------- | ------------------------------------- | ---------------------- |
| `MySqlDatabaseType`    | `common/types/mysql-database.type`    | Drizzle 数据库实例类型 |
| `MySqlTransactionType` | `common/types/mysql-transaction.type` | 事务回调参数类型       |
| `NotEmptyArrayType<T>` | `common/types/not-empty-array.type`   | 非空数组约束类型       |

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     DatabaseModule                          │
│                                                             │
│  ┌─────────────────┐   ┌──────────────────────────────────┐ │
│  │  ConfigModule    │   │        DatabaseService           │ │
│  │ (database.config)│──▶│  - _pool: mysql2 Pool            │ │
│  └─────────────────┘   │  - db: Drizzle<Schema>           │ │
│                         │  - onModuleInit: ping 验证        │ │
│                         │  - onModuleDestroy: pool.end()   │ │
│                         └──────────────────────────────────┘ │
│                                                             │
│  （init/seed Token 与 ToolsService 由 ToolsModule 注册，见 tools/）   │
│                                                             │
│  exports: [DatabaseService]                                 │
└─────────────────────────────────────────────────────────────┘
```
