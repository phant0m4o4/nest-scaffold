# 数据库：Drizzle + MySQL / PostgreSQL

默认装配 MySQL。PostgreSQL 提供平行实现，按项目需要选用，不要求业务同时维护两套库。切换方式与连接说明见[数据库模块](../modules/database.md)。

## Schema 与迁移

- 表定义放在 `src/database/<dialect>/schemas/<table-name>.schema.ts`，在同目录 `index.ts` 聚合导出；`<dialect>` 为 `mysql` 或 `pgsql`。
- 表名使用复数小写下划线，Schema 变量使用 `<tableName>Schema`，文件名为 kebab-case。
- 使用 `BaseRepository` 的表必须有名为 `id` 的数值型主键，否则构造时抛错。现有主键工厂使用 bigint、Drizzle `mode: 'number'`；业务输入仍需保证 JS 数字精度安全。
- Schema 的 `deletedAt` 属性触发基类软删除，可映射为 `timestamp('deleted_at')` 等实际 SQL 列名；识别基于属性名，不会因列名别名退化为物理删除。自定义查询需走 `_buildWhereFilter(...)`，不能只依赖基类替所有查询过滤。
- 跨表复用枚举放 `src/database/enums/`，仅本表使用的可就地声明。沿用既有枚举值，不为风格修改已存储的数据。

参考真实定义：[MySQL Demo](../../src/database/mysql/schemas/demos.schema.ts)、[PostgreSQL Demo](../../src/database/pgsql/schemas/demos.schema.ts)。新表模板见 [schema.ts.tpl](../../scripts/templates/schema.ts.tpl)。

| 工厂                                   | 作用                                             |
| -------------------------------------- | ------------------------------------------------ |
| `createPrimaryKeyColumn()`             | MySQL unsigned bigint 自增；PG bigint identity   |
| `createPublicIdColumn(name?, length?)` | 默认长度 21 的公开字符串列；需要额外声明唯一约束 |
| `createForeignKeyColumn(name?)`        | 与主键类型匹配的可空关联列；外键约束另行声明     |
| `createTimestamps()`                   | `createdAt`、`updatedAt`                         |
| `createTimestampsWithSoftDelete()`     | 额外提供 `deletedAt`                             |

工具位于各方言的 `utils/`。PG 的 `updatedAt` 使用 Drizzle `$onUpdate`，不是数据库层的 `ON UPDATE CURRENT_TIMESTAMP`；绕过应用直接写 SQL 时需自行维护。

表结构由迁移管理，开发与生产使用同一套迁移文件：

```bash
pnpm db:generate:mysql --name=add-user-profile
# 检查 drizzle/mysql/ 新增 SQL
pnpm db:migrate:mysql
```

迁移随代码提交。使用清晰的 `--name`，不要将 `drizzle-kit push` 纳入日常开发或部署；已经部署的迁移不回头改写，新增迁移修正。涉及删表、缩短列、收紧约束等变更，先评估现有数据、锁表和恢复方式。

生产定时 / 按需备份和恢复步骤见[备份与恢复](../backup-and-restore.md)。破坏性变更前先确认可恢复的备份及对应版本；migration、seed 和应用镜像都不能替代业务数据备份，恢复演练不得覆盖生产库。

## 公开标识

是否增加公开标识按业务决定，不是每张表都需要长码和短码。主键用于内部关联；面向用户的资源标识采用长码，管理接口按需要使用 `id`。**不可猜测的标识不能代替资源归属校验。**

| 用途                   | 现有策略                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| URL 资源标识等长码     | `generatePublicId()` 默认 21 位；仓储创建时直接生成并插入，不做预查/重试 |
| 邀请码等便于抄写的短码 | `generatePublicId(8)`；有界查空后插入，最终由数据库唯一约束兜底          |

列名按业务语义，例如 `accessKey`、`inviteCode`；`publicId` / `shortPublicId` 只是 Demo 示例。列宽与生成长度一致，并分别添加唯一约束。

[DemoRepository](../../src/app/repositories/demo.repository.ts) 的当前策略：短码最多查空 8 次；长码确认碰撞、短码查空耗尽或插入竞态碰撞时转为不透明的 `RepositoryException`，不无限换号重试。名称等业务唯一键冲突仍保留 `RecordAlreadyExistsException`。创建方法不接受调用方提供这两类生成字段，返回内部 ID 与公开标识，再由控制器选择可见字段。

## 仓储

业务仓储放在 `src/app/repositories/`，继承对应方言的 [MySQL BaseRepository](../../src/common/modules/database/mysql/repositories/base.repository.ts) 或 [PostgreSQL BaseRepository](../../src/common/modules/database/pgsql/repositories/base.repository.ts)。

### 职责与注册

- 业务仓储了解具体业务表、业务唯一键和表特有查询；通用基类、异常、分页接口、错误映射及游标工具放在 `src/common/modules/database/`。
- `DatabaseModule` 只提供数据库连接、Drizzle 实例及连接生命周期，不反向依赖或集中注册业务仓储。
- 业务模块通过 `RepositoryModule.forFeature(...)` 按需注册仓储，避免业务仓储成为全局 Provider。
- 业务 Service 注入仓储，不直接查询 `databaseService.db`；只有需要协调多个仓储的事务边界时才注入 `DatabaseService`。

示例：假设已经定义并导出 `usersSchema`，业务仓储写在 `src/app/repositories/users.repository.ts`：

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

在相应业务模块注册：

```typescript
import { UsersRepository } from '@/app/repositories/users.repository';
import { RepositoryModule } from '@/common/modules/database/repository.module';
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  imports: [RepositoryModule.forFeature([UsersRepository])],
  providers: [UsersService],
})
export class UsersModule {}
```

PostgreSQL 业务仓储改用对应的 `DatabaseService` 和 `pgsql/repositories/base.repository`；同一个仓储不要混用两种方言。现成示例见 [DemoRepository](../../src/app/repositories/demo.repository.ts)，仓储自身逻辑的单测放在相邻的 [**tests**/](../../src/app/repositories/__tests__/)。

### 基类接口

基类提供：

- `findOne({ db?, id })`：返回记录或 `null`。
- `findAll({ db?, order? })`、`findMany({ db?, filter?, limit?, order? })`。
- `findManyWithPagination({ db?, page, pageSize, filter?, order? })`。
- `findManyWithCursorPagination({ db?, limit, cursor?, filter?, order? })`。
- `create({ db?, data })`、`batchCreate({ db?, data })`。
- `update({ db?, id, data })`、`delete({ db?, id })`、`batchDelete({ db?, ids })`。
- `isExists({ db?, filters })`、`count({ db?, filter? })`。

参数对象中的 `db` 用于事务复用。排序列必须属于表定义，游标排序以 `id` 作最后一个排序列。公开接口应通过 DTO 限制页大小和排序白名单；现有 Demo 的游标白名单只包含非空字符串、数字和日期列。自定义接口也要明确限制，不能直接接受任意客户端排序表达式或假定仓储会预先检查所有列类型。

仓储游标是内部多列 keyset，服务负责编解码对外密文，详见 [REST API](rest-api.md)。

## 事务与一致性

```ts
await this._databaseService.db.transaction(async (tx) => {
  await this._userRepository.create({ db: tx, data: userData });
  await this._walletRepository.create({ db: tx, data: walletData });
});
```

抛错会回滚；需要处于同一事务的调用都必须传 `db: tx`，不能中途落回默认连接。余额、库存等并发正确性需要条件更新、行锁或唯一约束等数据库保障，不能仅依赖缓存或分布式锁。

## 异常映射

基类写入操作通过相应方言 mapper 转换驱动错误；新增自定义写入也应沿用。全局过滤器负责 HTTP 映射：

| 情况                  | 项目异常                                 | HTTP          |
| --------------------- | ---------------------------------------- | ------------- |
| 唯一约束冲突          | `RecordAlreadyExistsException`           | 409           |
| 外键约束冲突          | `ForeignKeyConstraintViolationException` | 409           |
| 非空、长度或非法数据  | `DataIntegrityViolationException`        | 400           |
| 死锁                  | `DeadlockDetectedException`              | 409           |
| 锁等待超时            | `LockWaitTimeoutException`               | 503           |
| 按 ID 更新/删除未命中 | `RecordNotFoundException`                | 404           |
| 未分类数据访问错误    | `RepositoryException`                    | 500，隐藏细节 |

只在能恢复或需要改变业务语义时捕获。驱动错误代码以 [MySQL mapper](../../src/common/modules/database/mysql/repositories/utils/mysql-error-mapper.util.ts) / [PG mapper](../../src/common/modules/database/pgsql/repositories/utils/pgsql-error-mapper.util.ts) 为准，不复制维护第二份代码表。

## 基础数据、seed 与 reset

必备角色、系统配置等基础数据使用自定义数据迁移：

```bash
pnpm db:generate:mysql --custom --name=add-base-data
# 在生成的 SQL 中编写基础数据操作，再检查并应用迁移
pnpm db:migrate:mysql
```

演示数据由 `src/database/<dialect>/seed.ts` 提供；seed 与 reset CLI 在生产环境拒绝执行，并有交互确认。

| 命令                                       | 用途                                               |
| ------------------------------------------ | -------------------------------------------------- |
| `NODE_ENV=development pnpm db:seed:mysql`  | 填充演示数据                                       |
| `NODE_ENV=development pnpm db:reset:mysql` | 删除全部表及迁移记录，重放迁移，恢复结构和基础数据 |

`reset` 会破坏目标数据库内容，只用于确认过的本地/测试库；它不会自动重放演示 seed。

[unique 工具](../../src/common/modules/database/common/utils/unique.ts) 用进程内集合辅助 faker seed 去重，只适合一次性 CLI，不能当数据库唯一约束，也不能在长期运行服务中使用。Demo 固定 faker 种子，引用基础数据 ID 的地方需随基础迁移一起核对。

## PostgreSQL 与本地依赖

PostgreSQL 命令后缀换成 `:pgsql`，迁移目录换成 `drizzle/pgsql/`。PG 枚举是独立类型，需要声明并导出 `pgEnum`，不要直接套 MySQL 的列枚举写法。

本地数据库、Redis 与管理界面以 [docker-compose.yml](../../docker-compose.yml) 为准，只启用本项目需要的服务。完整环境变量见 [.env.example](../../.env.example) 与 [配置文档](env-vars.md)，不在本页再维护密码示例。
