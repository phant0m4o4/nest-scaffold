# 业务仓储

`src/app/repositories/` 只放按业务领域定义的仓储，例如 `DemoRepository`、`UserRepository`。通用仓储基类、异常、分页接口、错误映射和游标工具属于数据库基础设施，统一放在 `src/common/modules/database/`。

## 职责边界

- 业务仓储了解具体业务表、业务唯一键和表特有查询。
- `DatabaseModule` 只负责数据库连接、Drizzle 实例和连接生命周期，不集中注册业务仓储。
- `RepositoryModule.forFeature(...)` 在对应业务模块中按需注册仓储，避免业务仓储成为全局 Provider。
- `BaseRepository` 等通用能力见 [DatabaseModule](../../common/modules/database/README.md)。

## 目录结构

```
src/app/repositories/
├── __tests__/
│   └── demo.repository.spec.ts
├── demo.repository.ts
└── README.md
```

## 定义业务仓储

```typescript
import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import { BaseRepository } from '@/common/modules/database/mysql/repositories/base.repository';
import { usersSchema } from '@/database/mysql/schemas/users.schema';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersRepository extends BaseRepository<typeof usersSchema> {
  constructor(private readonly _databaseService: DatabaseService) {
    super(usersSchema, _databaseService.db);
  }
}
```

PostgreSQL 业务仓储使用对应的 `DatabaseService` 和 `pgsql/repositories/base.repository`，同一个业务仓储不要混用两种方言。

## 按业务模块注册

```typescript
import { UsersRepository } from '@/app/repositories/users.repository';
import { RepositoryModule } from '@/common/modules/database/repository.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [RepositoryModule.forFeature([UsersRepository])],
  providers: [UsersService],
})
export class UsersModule {}
```

业务 Service 注入仓储，不直接使用 `databaseService.db`；只有需要协调多个仓储的事务边界时才注入 `DatabaseService`。
