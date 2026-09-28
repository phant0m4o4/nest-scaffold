# 基础设施模块

本页帮助选择已有能力和识别安全边界。具体 API、参数及示例统一在 `docs/modules/` 维护，不重复复制。中小项目优先使用当前配置，出现真实需求后再增加依赖或部署复杂度。

## 使用入口

| 需求                           | 模块文档                                                                                                                 | 使用要点                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 数据持久化、事务、分页         | [Database](../modules/database.md)（[MySQL](../modules/database-mysql.md) / [PostgreSQL](../modules/database-pgsql.md)） | 默认 MySQL，PostgreSQL 可选；业务仓储按需注册                                             |
| JSON 缓存、TTL、批量读写、计数 | [Cache](../modules/cache.md)                                                                                             | 已在根模块装配；避免把缓存当唯一数据源                                                    |
| 跨实例互斥、减少重复执行       | [DistributedLock](../modules/distributed-lock.md)                                                                        | 已装配；不能替代数据库并发约束                                                            |
| 异步、重试、延迟任务           | [Queue](../modules/queue.md)                                                                                             | 根模块装配基础配置，业务模块注册自己的队列                                                |
| 上传、读取、删除文件对象       | [Storage](../modules/storage.md)                                                                                         | 非全局，业务模块按需导入；S3 私有对象，不提供公开上传接口                                 |
| 浏览器直传文件                 | [UploaderService](../modules/storage.md#浏览器直传)                                                                      | 导入同一个 `StorageModule` 后注入服务；短时防覆盖链接与元数据核验，业务负责鉴权和可信记录 |
| 第三方接口速率限制             | [Bottleneck](../modules/bottleneck.md)                                                                                   | 可选，默认内存模式；需要跨实例共享限额时才选 Redis                                        |
| 结构化日志                     | [Logger](../modules/logger.md)                                                                                           | 已装配，敏感数据不得直接写日志                                                            |
| 多语言与校验文案               | [I18n](../modules/i18n.md)                                                                                               | 已装配，后端按请求语言生成校验文案                                                        |

不是所有模块都带 `@Global()`。按各模块的注册方式使用，见 [架构与装配](architecture.md)。

## Redis 的连接与数据边界

- 只支持单机 `single` 和哨兵 `sentinel`；默认单机，不引入 Cluster。
- 各模块有独立配置命名空间和客户端，不在缓存、锁、队列间共享客户端。`REDIS_*` 仅是 `.env` 中供变量展开的公共锚点。
- 缓存、锁和队列使用不同 DB；示例分配 `0` / `1` / `2`，可选限流为 `3`。
- **独立连接和 DB 不等于独立实例**：内存上限、淘汰策略和故障仍然共享。锁与队列不能被淘汰；缓存需要淘汰策略时应与它们分实例。
- 业务代码不调用 `cache.flush()` / `FLUSHDB`；这会清空该 DB 全部数据。
- 队列连接由 BullMQ 创建和关闭，Worker 的阻塞连接不能复用普通缓存客户端。

确有原生 Redis 数据结构需求时，可复用 [连接解析](../../src/common/utils/redis/redis-connection.ts) 与 [客户端工厂](../../src/common/utils/redis/redis.factory.ts)，并由所属模块负责初始化与关闭。不要提前创建一个所有模块共享的 Redis 层。

连接字段与单机/哨兵示例见 [配置文档](env-vars.md) 和 [.env.example](../../.env.example)。

缓存、锁、队列的备份和恢复策略不同，不能直接整体覆盖共享实例；恢复后的任务重放及外部副作用需单独控制，见[备份与恢复](../backup-and-restore.md#redis-与配置恢复的补充约束)。

## 分布式锁

`DistributedLockService.using()` 自动获取、续期和释放锁。回调应检查续期失败的中止信号，并停止继续依赖互斥性的操作。

单机或哨兵切换可能丢失尚未复制的锁记录；自动续期也不保证业务执行永不超时。余额、库存、唯一性等正确性仍由事务、条件更新、行锁或唯一约束保证；外部副作用应设计幂等，不能只靠一把锁。

资源键应能表达真实互斥范围，同一资源的相关操作使用一致键；按业务域集中定义即可，不需要预置通用锁键框架。

## 队列

任务处理需考虑重复投递、重试与中途失败；幂等性由业务实现。不要为普通同步服务调用强行引入队列。

`globalConcurrency` 是跨 Worker 的队列上限，并持久化在 Redis：正安全整数设置上限，`0` 清除已有上限，不传或 `undefined` 保持已有值。共享队列的实例应使用一致配置。单 Worker 并发由 `@Processor(..., { concurrency })` 控制。

Bull Board 仅开发环境启用；开发环境也不要直接暴露到不可信网络。

## 文件与对象存储

`StorageModule` 统一注册并导出 `StorageService` 和 `UploaderService`。`StorageService` 提供 `put`、`get`、`readBuffer`、`head`、`delete` 和 `presignPut`，使用配置中的 S3 兼容 bucket。服务端文件内容以流或受限内存处理，不接收本地路径，不提供本地存储驱动。key 的归属与授权、同名对象的覆盖策略由业务层负责。

浏览器直传注入同模块的 `UploaderService`：生成随机 key、签发短时防覆盖 PUT 链接，并通过 `verifyUpload` 核对可信记录中的类型和长度。服务不提供公开 Controller 或严格一次性票据；业务负责认证、配额与完成状态，存储管理员独立配置 bucket CORS。详细流程与浏览器示例见 [UploaderService](../modules/storage.md#浏览器直传)。

默认应用不依赖 Storage；业务模块显式导入后才需要配置。生产使用 HTTPS、私有 bucket 与专用凭据，本地使用独立的 [SeaweedFS 服务](../getting-started.md#本地-s3-存储)。流的消费、大小与并发限制、失败清理及结果不确定的处理见 [Storage 模块](../modules/storage.md)。

## 日志与国际化

日志 `msg` 使用中文，`event` / `reason` 使用稳定英文标识。按需要记录关联 ID、耗时和错误原因；不要为了固定字段清单制造无用日志，也不要无条件采样导致重要事件丢失。

现有脱敏规则只能覆盖已配置路径，不能代替调用处检查；不要记录完整请求体、凭证或连接串。

项目后端已有国际化：`I18nZodValidationPipe` 按请求语言输出 `errors[].message`，同时保留稳定的 `field` / `code` / `params`。新增对外字段和校验文案时同步维护 [翻译资源](../../src/i18n)，不要把这套契约误写成“后端不做 i18n”。
