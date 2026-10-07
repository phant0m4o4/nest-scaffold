# 业务模块开发

以 [Demo 模块](../../apps/server/src/app/api/demo) 作为可运行示例，以 [模板](../../scripts/templates/feature-module) 作为生成起点；按业务裁剪，不必为每个模块生成整套 CRUD、缓存或队列。

## 新建模块

在仓库根目录运行：

```bash
bash scripts/new-module.sh user-profile
```

脚本用法与行为见 [scripts/README.md](../../scripts/README.md)。生成后需要补表定义、迁移、真实业务逻辑、API 模块装配和测试；模板不是完成的业务实现。

生成器只创建 `apps/server` 中的 MySQL 服务端模块，不生成管理页面、Expo 路由或共享契约。新增需要两端消费的接口时，同步维护 `packages/contracts` 与 `packages/api-client`，再在对应前端实现页面；具体边界见[前端开发](frontends.md)。PostgreSQL 项目需按实际方言调整生成的 Schema、仓储和导入。

## 目录与职责

| 位置                                                      | 职责                                    |
| --------------------------------------------------------- | --------------------------------------- |
| `apps/server/src/app/api/<domain>/<domain>.module.ts`     | 注册服务、控制器及所需仓储/队列         |
| `<domain>.controller.ts`                                  | HTTP 路由、参数 DTO、调用服务、响应净化 |
| `<domain>.service.ts`                                     | 业务规则与依赖编排                      |
| `dtos/`                                                   | 请求与路径参数校验                      |
| `entities/`                                               | 显式定义可公开的响应字段                |
| `__tests__/`                                              | 模块相关单测和集成测试                  |
| `apps/server/src/app/repositories/<domain>.repository.ts` | 表查询、数据写入和领域数据访问          |

仓储基础设施位于 `apps/server/src/common/modules/database/`，不与业务仓储混放。接口、常量等按实际需要增加，不为凑齐目录而建空文件。

## 控制器

- 使用 `@Body()` / `@Query()` / `@Param()` 接收 `createZodDto` DTO，由全局管道校验。需要读取原始请求的功能显式说明用途，不能跳过对应的安全校验。
- 返回 `{ data?, meta? }`，交由全局拦截器包装状态码。
- 数据返回前用响应实体 `.create(raw)` 净化，不能直接暴露 Drizzle 原始行。
- 不编写数据库查询或业务状态转换逻辑。

参考 [DemoController](../../apps/server/src/app/api/demo/demo.controller.ts) 与 [AdminDemoController](../../apps/server/src/app/api/demo/admin-demo.controller.ts)，响应、路径标识与分页约定见 [REST API](rest-api.md)。

## 服务

服务调用仓储或其他服务，只有需要跨仓储事务时才在服务中开启 `databaseService.db.transaction(...)`，并把 `tx` 传给每个仓储的 `db` 参数。

HTTP DTO 只能保证输入形状，不能代替授权、状态迁移、余额/库存等业务规则。非 HTTP 调用入口也需要明确校验边界。

复杂过滤逻辑可抽为 `_buildFilters`，数据读写仍交给仓储。游标分页由服务校验筛选范围和排序声明，并用应用主密钥编解码；参考 [DemoService](../../apps/server/src/app/api/demo/demo.service.ts)。

新增上传、导出或文件处理能力时，在业务模块导入 `StorageModule` 并注入 `StorageService`，用法见 [Storage 模块](../modules/storage.md)。遵守[文件写入约束](engineering-conventions.md#文件写入与-storage)：统一使用 S3，以流或受限内存处理，不在 Controller、Service、Worker 或第三方库中临时落盘，也不增加本地降级路径。业务层负责认证、key 的归属授权和同名覆盖策略；不能直接开放无鉴权上传接口，也不能把 key 格式校验当作权限校验。

## 仓储

继承实际使用方言的 `BaseRepository`。基础 CRUD、分页和软删除能力见 [数据库文档](database.md)，这里只增加表特有查询。

自定义查询需要：

- 接受可选 `db` 参数，默认用 `this._db`，从而支持调用方事务。
- 通过 `_buildWhereFilter(...)` 合并过滤条件，表启用软删除时不能漏掉 `deletedAt` 条件。
- 使用 Drizzle 参数化查询；需要自定义错误处理时使用对应方言的异常映射，不向上泄露驱动细节。
- 将查无记录、唯一冲突等结果按既有契约交给服务/全局过滤器；只有可恢复或需要补上下文时才捕获。

参考 [DemoRepository](../../apps/server/src/app/repositories/demo.repository.ts)。公开标识的分配和碰撞策略见 [数据库文档](database.md)。

## 模块装配

业务模块通过 `RepositoryModule.forFeature([FeatureRepository])` 注册仓储，再将自身加入 `apps/server/src/app/api/api.module.ts`。需要加密游标时同时导入 `ConfigModule.forFeature(appConfig)`。

具体写法见 [DemoModule](../../apps/server/src/app/api/demo/demo.module.ts)。只导入实际依赖，不因脚手架提供了某项能力就全部启用。

跨模块同步调用可以通过对方模块 `exports` 服务、调用方 `imports` 模块来实现。避免循环依赖；只有需要异步处理、重试或跨实例分发时才使用事件/队列，不强制为普通复用引入消息层。

## 鉴权边界

脚手架目前**没有内置完整的 JWT 登录、权限或资源归属校验**，也没有可直接使用的 `JwtAuthGuard` / `AuthPublic` 装饰器。

需要密码哈希时可复用 [hash.ts](../../apps/server/src/common/utils/hash.ts) 中基于 Argon2 的 `hash(data)` 与 `hashCompare(storedHash, data)`；该工具不等于已实现登录或会话管理。

Demo 控制器仅开发和测试环境启用；真实业务接口和管理接口必须按业务补认证、授权与资源归属校验，不能把 `admin/` 路由前缀或公开长码当作授权机制。鉴权方案按项目需要选择，不在模板中假装已有实现。

## 测试与交付

按行为和风险补测试：纯业务分支用单测，真实数据库/Redis 交互用集成测试，关键公开链路用 E2E。具体层级与命令见 [测试规范](testing.md)，日常验证见 [开发流程](workflows.md)。
