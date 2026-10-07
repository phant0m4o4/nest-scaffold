# DatabaseModule

源码：[database/](../../apps/server/src/common/modules/database/)。业务 Schema、仓储和迁移约定见[数据库开发文档](../development/database.md)。

数据库基础设施入口，包含数据库连接、Drizzle 仓储基类、错误映射、分页接口、游标工具，以及按业务注册仓储的 `RepositoryModule`。

业务 Schema 仍放在 `apps/server/src/database/<dialect>/schemas/`，业务仓储仍放在 `apps/server/src/app/repositories/`。基础设施与业务实现只通过继承和依赖注入连接，`DatabaseModule` 不反向依赖或集中注册业务仓储。

## 目录结构

```
apps/server/src/common/modules/database/
├── common/
│   ├── repositories/
│   │   ├── exceptions/             # 两种方言共享的仓储异常
│   │   └── interfaces/             # 分页、排序与 keyset 接口
│   ├── types/
│   └── utils/
├── mysql/
│   ├── common/types/
│   ├── repositories/
│   │   ├── base.repository.ts      # MySQL 通用 CRUD、分页与软删除
│   │   └── utils/                  # 错误映射与游标工具
│   ├── tools/
│   ├── database.module.ts
│   └── database.service.ts
├── pgsql/
│   └── ...                         # 与 MySQL 平行
├── constants/
├── interfaces/
└── repository.module.ts            # forFeature(...) 按业务模块注册仓储
```

## 模块职责

- `DatabaseModule`：全局提供对应方言的 `DatabaseService`，管理连接和生命周期。
- `RepositoryModule`：不持有连接，也不集中注册业务仓储；业务模块通过 `forFeature(...)` 按需声明。
- `BaseRepository`：提供 CRUD、普通分页、keyset 游标分页和软删除。
- `apps/server/src/app/repositories/`：存放了解具体业务表和业务查询的仓储实现。

目录上把仓储基础设施放进 database，NestJS 模块职责上仍保持连接管理与业务仓储注册分离。

## 分页与删除约定

- 游标排序仅支持非空的字符串、数字和日期列。业务接口须单独维护游标排序白名单；例如 Demo 拒绝 `parentId:asc,id:asc` 并返回 400，与页大小、是否还有下一页无关。普通页码分页仍可按可空列排序。
- 两种数据库的单条与批量删除（含软删除）都复用对应错误映射：外键冲突、死锁转为 409，锁等待超时转为 503；记录不存在仍为 404。批量删除仍先检查记录存在性，异常映射不赋予其跨查询的事务一致性。
- 软删除按 Schema 属性 `deletedAt` 识别，支持映射到 `deleted_at` 等 SQL 列名；查询继续过滤已删除行，单条与批量删除只更新时间戳、保留物理行。

## 按数据库方言选择

- [MySQL](database-mysql.md)：Drizzle ORM + MySQL2，脚手架默认启用。
- [PostgreSQL](database-pgsql.md)：Drizzle ORM + node-postgres。
- 只使用一种数据库时，在 `AppModule` 导入对应方言的 `DatabaseModule`。
- 同时使用两种数据库时，用导入别名区分两个同名模块；两个 `DatabaseService` 也必须从各自路径注入。

```typescript
import { DatabaseModule as MysqlDatabaseModule } from '@/common/modules/database/mysql/database.module';
import { DatabaseModule as PgsqlDatabaseModule } from '@/common/modules/database/pgsql/database.module';
```

切换到 PostgreSQL 不是只改环境变量或根模块导入：

1. 配置 `apps/server/.env` 的 `PGSQL_*`，在隔离开发库应用 `pnpm db:migrate:pgsql`。
2. 将 `AppModule` 的数据库模块切到 `pgsql`；业务仓储同时调整 `DatabaseService`、`BaseRepository`、数据库/事务类型、Schema 和方言相关写入。
3. 核对业务 Service、DTO 中引用的 Schema、排序元数据与游标工具。现有 Demo 仍使用 MySQL 的 Schema、`getTableConfig` 和游标导入，保留 Demo 时也须一起调整。
4. 同步对应的 seed、生成脚本使用方式与测试。`scripts/new-module.sh` 当前生成 MySQL 骨架，不会自动随数据库切换；数据从旧库迁往新库也不属于模块切换自动完成的内容。

上述 `pnpm` 命令从仓库根执行，转发到 `apps/server`。业务无需同时维护两套方言；选择 PostgreSQL 后，应通过对应的隔离集成测试核对实际行为。

## 定义业务仓储

业务仓储继承对应方言的 `BaseRepository`，并注入同一方言的 `DatabaseService`。完整定义示例、业务职责与注册约定见[数据库开发文档](../development/database.md#职责与注册)。

## 按业务模块注册

```typescript
import { UsersRepository } from '@/app/repositories/users.repository';
import { RepositoryModule } from '@/common/modules/database/repository.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [RepositoryModule.forFeature([UsersRepository])],
})
export class UsersModule {}
```

不要把业务仓储加入 `DatabaseModule` 的 providers；这样会让数据库基础设施反向依赖业务代码，并把本应按领域可见的仓储扩大为全局依赖。

## 共享部分

| 路径                                   | 用途                          |
| -------------------------------------- | ----------------------------- |
| `common/repositories/exceptions/`      | 方言无关的仓储异常            |
| `common/repositories/interfaces/`      | 分页、排序和 keyset 类型      |
| `common/utils/unique.ts`               | seed 脚本使用的唯一值生成工具 |
| `common/types/not-empty-array.type.ts` | 通用非空数组类型              |
| `constants/database.tokens.ts`         | `DATABASE_SEEDER` Token       |
| `interfaces/seeder.interface.ts`       | seed CLI 契约                 |

各方言的 `tools/` 提供 `db:seed` 和 `db:reset` CLI，并复用上述 Token 与接口。
