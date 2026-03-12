# Repository 模块

通用仓储层，基于 Drizzle ORM 封装 CRUD、分页、软删除等数据访问能力。

## 功能特性

- **BaseRepository 抽象基类** — 提供完整的 CRUD + 分页 + 软删除能力，业务仓储零样板继承
- **两种分页模式** — 普通分页（page/pageSize）与游标分页（cursor/limit）
- **自动软删除** — 表含 `deletedAt` 列时自动启用，查询/删除无感知切换
- **MySQL 错误映射** — 将数据库错误码转换为语义化领域异常
- **RepositoryModule** — 支持 `forRoot` / `forFeature` 动态注册仓储

## 目录结构

```
src/app/repositories/
├── common/
│   ├── base.repository.ts              # 抽象基类
│   ├── utils/
│   │   └── mysql-error-mapper.util.ts  # MySQL 错误码 → 领域异常映射
│   ├── interfaces/
│   │   ├── pagination-result.interface.ts        # 普通分页结果
│   │   ├── cursor-pagination-result.interface.ts  # 游标分页结果
│   │   └── order-option.interface.ts              # 排序选项
│   └── exceptions/
│       ├── repository-exception.ts                 # 基础异常
│       ├── record-not-found-exception.ts           # 记录未找到
│       ├── record-already-exists-exception.ts      # 记录已存在（唯一键冲突）
│       ├── foreign-key-constraint-violation-exception.ts  # 外键约束冲突
│       ├── deadlock-detected-exception.ts          # 死锁
│       ├── lock-wait-timeout-exception.ts          # 锁等待超时
│       └── data-integrity-violation-exception.ts   # 数据完整性异常
├── demo.repository.ts                  # 示例仓储
├── repository.module.ts                # 模块定义
├── __tests__/                          # 单元测试
│   ├── base.repository.spec.ts
│   ├── mysql-error-mapper.util.spec.ts
│   └── exceptions.spec.ts
└── README.md
```

## 快速开始

### 1. 定义仓储

```typescript
import { DatabaseService } from '@/common/modules/database/database.service';
import { usersSchema } from '@/database/schemas/users.schema';
import { Injectable } from '@nestjs/common';
import { BaseRepository } from './common/base.repository';

@Injectable()
export class UsersRepository extends BaseRepository<typeof usersSchema> {
  constructor(private readonly _databaseService: DatabaseService) {
    super(usersSchema, _databaseService.db);
  }
}
```

### 2. 注册仓储

**根模块（全局）：**

```typescript
RepositoryModule.forRoot({
  isGlobal: true,
  repositories: [UsersRepository],
});
```

**业务子模块（按需）：**

```typescript
RepositoryModule.forFeature([OrdersRepository]);
```

### 3. 使用仓储

```typescript
@Injectable()
export class UserService {
  constructor(private readonly _usersRepo: UsersRepository) {}

  async findUser(id: number) {
    return this._usersRepo.findOne({ id });
  }

  async listUsers(page: number, pageSize: number) {
    return this._usersRepo.findManyWithPagination({ page, pageSize });
  }

  async createUser(data: typeof usersSchema.$inferInsert) {
    return this._usersRepo.create({ data });
  }
}
```

## API 概览

### BaseRepository\<TSchema\>

所有方法均支持可选的 `db` 参数，用于在事务中传入事务实例。

| 方法                                                                | 说明                  | 返回值                             |
| ------------------------------------------------------------------- | --------------------- | ---------------------------------- |
| `findOne({ id })`                                                   | 主键查找单条          | `TSchema['$inferSelect'] \| null`  |
| `findAll({ order? })`                                               | 查询所有记录          | `TSchema['$inferSelect'][]`        |
| `findMany({ filter?, limit?, order? })`                             | 条件查询              | `TSchema['$inferSelect'][]`        |
| `findManyWithPagination({ page, pageSize, filter?, order? })`       | 普通分页              | `IPaginationResult<TSchema>`       |
| `findManyWithCursorPagination({ limit, cursor?, filter?, order? })` | 游标分页              | `ICursorPaginationResult<TSchema>` |
| `create({ data })`                                                  | 创建单条              | `id`                               |
| `batchCreate({ data })`                                             | 批量创建              | `{ id }[]`                         |
| `update({ id, data })`                                              | 更新                  | `void`                             |
| `delete({ id })`                                                    | 删除（自动判断软/硬） | `void`                             |
| `batchDelete({ ids })`                                              | 批量删除              | `void`                             |
| `isExists({ filters })`                                             | 是否存在              | `boolean`                          |
| `count({ filter? })`                                                | 统计数量              | `number`                           |

### RepositoryModule

| 方法                                    | 说明               |
| --------------------------------------- | ------------------ |
| `forRoot({ isGlobal?, repositories? })` | 根模块注册，可全局 |
| `forFeature(repositories)`              | 子模块按需注册     |

## 异常体系

所有仓储异常继承自 `RepositoryException`（→ `Error`），可在全局过滤器中统一处理。

| 异常类                                   | MySQL 错误码        | 建议 HTTP 状态码 | 说明                         |
| ---------------------------------------- | ------------------- | ---------------- | ---------------------------- |
| `RecordNotFoundException`                | —                   | 404              | 记录不存在                   |
| `RecordAlreadyExistsException`           | 1062 (ER_DUP_ENTRY) | 409              | 唯一键冲突                   |
| `ForeignKeyConstraintViolationException` | 1451, 1452          | 409              | 外键约束冲突                 |
| `DeadlockDetectedException`              | 1213                | 503 / 重试       | 死锁                         |
| `LockWaitTimeoutException`               | 1205                | 503 / 重试       | 锁等待超时                   |
| `DataIntegrityViolationException`        | 1048, 1366, 1406    | 400              | 数据完整性（非空/类型/长度） |

## 软删除机制

- 表中包含 `deletedAt` 列时**自动启用**软删除
- `findOne` / `findMany` / `findAll` 等查询方法自动过滤已软删除记录
- `delete` / `batchDelete` 自动选择软删除（设置 `deletedAt` 为当前 UTC 时间）或硬删除
- 可通过 `_buildWhereFilter(filter, true)` 的 `ignoreSoftDelete` 参数跳过软删除过滤

## 事务支持

所有方法均支持 `db` 参数，在事务中传入事务实例即可：

```typescript
await this._db.transaction(async (tx) => {
  const id = await this._usersRepo.create({ db: tx, data: userData });
  await this._ordersRepo.create({ db: tx, data: { userId: id, ...orderData } });
});
```

## 排序选项

通过 `IOrderOption` 接口指定排序列和方向：

```typescript
// 单列排序
await repo.findMany({ order: { column: 'createdAt', direction: 'desc' } });

// 多列排序
await repo.findMany({
  order: [
    { column: 'priority', direction: 'desc' },
    { column: 'id', direction: 'asc' },
  ],
});
```

## 注意事项

- 表**必须**拥有 `id` 列（int 类型、主键），否则构造时抛出错误
- 游标分页仅支持按 `id` 列进行游标定位
- `mapMysqlErrorAndThrow` 始终抛出异常（返回类型 `never`），不会静默吞掉错误
- 业务仓储应继承 `BaseRepository` 并通过 `@Injectable()` 注册
