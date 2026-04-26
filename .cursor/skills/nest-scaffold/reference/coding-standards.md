# 编码规范（TypeScript & 通用）

## 总则

- **代码英文，注释与文档中文**。
- **所有类型显式声明**：函数参数、返回值、变量。避免 `any`，必要时用 `unknown` 并收窄。
- 公共类与方法用 JSDoc 写中文说明。
- 函数体内不留空行（小函数优先）。
- 每个文件只有一个导出。
- ESLint 已开 `recommendedTypeChecked`，`@typescript-eslint/no-floating-promises` 为 warn —— 异步调用必须 await 或显式 `void`。

## 命名

| 对象 | 风格 | 示例 |
|------|------|------|
| 类 / 接口 / 类型 | PascalCase | `UserService`, `IUserPayload` |
| 接口名 | `IPascalCase` | `IUserService`, `IPaginationResult` |
| 变量 / 函数 / 方法 | camelCase | `findOne`, `userId` |
| 文件 / 目录 | kebab-case | `user-profile.service.ts`, `access-key/` |
| 环境变量 | UPPER_SNAKE | `MYSQL_HOST`, `REDIS_PORT` |
| 常量字面量 | UPPER_SNAKE | `const DEFAULT_LIMIT = 30 as const;` |
| 枚举值（DB 通用枚举） | camelCase | `{ type1: 'type1' }` |
| 私有成员 | `_xxx` 前缀 | `private _logger`, `private _buildFilters()` |

文件名后缀（kebab-case + dots）：

- 模块：`*.module.ts`
- 控制器：`*.controller.ts`
- 服务：`*.service.ts`
- 守卫 / 拦截器 / 过滤器 / 管道 / 装饰器：`*.guard.ts` / `*.interceptor.ts` / `*.filter.ts` / `*.pipe.ts` / `*.decorator.ts`
- 仓储：`*.repository.ts`
- DTO：`*.dto.ts`，命名见 `rest-api.md`
- 接口：`*.interface.ts`
- 类型：`*.type.ts`
- Drizzle Schema：`*.schema.ts`
- Passport：`*.auth.guard.ts`、`*.passport.module.ts`

布尔变量用 `isX` / `hasX` / `canX` 起手。

## 函数

- 单一职责，<= 20 行指令优先。
- 命名以动词起头：`getUser`、`buildFilters`、`executeJob`、`saveOrder`。
- 用早返/守卫语句避免嵌套。
- 简单逻辑（< 3 行）用箭头函数；复杂逻辑命名函数。
- 多参数用 RO-RO（receive object / return object）：

  ```ts
  // 推荐
  async create(options: { data: CreateUserDto; tx?: MySqlTransactionType }) {}
  // 不推荐
  async create(data: CreateUserDto, tx?: MySqlTransactionType) {}
  ```

- 禁止用 `setTimeout` 做业务时序，改用 BullMQ。

## 数据

- 不滥用原始类型；把字段封装为类（含校验）。
- 不可变优先：`readonly` / `as const`。
- 不在业务函数内做参数校验：DTO 的 class-validator 已经验证。

## 类

- 遵循 SOLID，组合优先于继承。
- 单一职责，< 200 行 / < 10 个公共方法 / < 10 个属性优先。
- 用接口定义契约（`I*.interface.ts`）。

## 异常

- 不要用异常控制业务流程。
- 仓储层用 `RepositoryException`/`RecordNotFoundException`/`RecordAlreadyExistsException` 等（见 `src/app/repositories/common/exceptions/`），通过 `mapMysqlErrorAndThrow` 把 mysql2 错误映射出来。
- 业务层捕获是为修复或加上下文，否则交全局过滤器。

## 异步

- 所有异步用 `async/await`，`Promise.all` 并发。
- 数据库事务用 `databaseService.db.transaction(async (tx) => { ... })`，事务内部传递 `tx` 给仓储 `db` 字段。

## ESLint / Prettier

- 已强制 `prettier/prettier` 规则；`pnpm lint` 自动修。
- `singleQuote: true`、`trailingComma: 'all'`（见 `.prettierrc`）。
- `endOfLine: 'auto'` —— 跨平台兼容。

## 必避

- 引入 `any`（特殊场景必须 PR 评审说明）。
- 在长期运行的服务里调用 `unique()`/`uniqueArray()`（见 `database.md`）。
- 在控制器中写业务逻辑或直接调用仓储。
- 在公共枚举里用 PascalCase 值（DB 枚举值要 camelCase）。
