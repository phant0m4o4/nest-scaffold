# 日志模块

源码入口：[LoggerModule](../../apps/server/src/common/modules/logger/logger.module.ts)。模块封装 `nestjs-pino`，提供结构化日志、请求 ID、指定字段脱敏和可选文件轮转。

本模块只负责 Nest 服务端日志，不包含浏览器、Expo 或 Nginx 的日志配置。日志是服务端应用运行时唯一允许的本地文件写入，不得把上传内容、导出文件或业务文件缓存写入日志目录。Docker 部署默认输出 stdout / stderr；其他文件统一走 S3 兼容 Storage，详见[文件写入与 Storage](../development/engineering-conventions.md#文件写入与-storage)。

## 注册与使用

[AppModule](../../apps/server/src/app/app.module.ts) 已注册 `LoggerModule.forRoot({ name: 'app' })`。底层 Pino 模块全局提供日志服务，业务模块无需重复导入。

```typescript
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class UserService {
  constructor(
    @InjectPinoLogger(UserService.name)
    private readonly _logger: PinoLogger,
  ) {}

  logQuery(userId: string): void {
    this._logger.info({ userId, event: 'user_query' }, '查询用户');
  }
}
```

[main.ts](../../apps/server/src/main.ts) 已用 `bufferLogs: true` 缓存启动日志，并调用 `app.useLogger(app.get(Logger))`、`app.flushLogs()` 接管 Nest 日志；不要另建启动入口重复配置。

需要绑定一组固定字段时，通过底层 Pino logger 创建子实例（`PinoLogger` 本身没有 `child()`）：

```typescript
const authLogger = this._logger.logger.child({
  context: 'AuthService',
  clientId,
});
authLogger.info({ event: 'auth_success' }, '认证成功');
```

## 环境与配置

| `NODE_ENV`    | 最低级别 | 控制台输出                    | 自动脱敏 | 文件落盘 |
| ------------- | -------- | ----------------------------- | -------- | -------- |
| `development` | `debug`  | pino-pretty 彩色输出到 stderr | 是       | 可选     |
| `test`        | `debug`  | pino-pretty 彩色输出到 stderr | 是       | 可选     |
| `production`  | `info`   | 结构化 JSON 输出到 stdout     | 是       | 可选     |

字段定义及校验以 [log.config.ts](../../apps/server/src/configs/log.config.ts) 为准，示例统一维护在 [.env.example](../../apps/server/.env.example)。

| 变量              | 默认值                                  | 说明                                                                                 |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `LOG_FILE_ENABLE` | `false`                                 | 是否启用文件落盘，建议明确写 `true` / `false`                                        |
| `LOG_FILE_DIR`    | 进程工作目录下的 `logs`（仅路径默认值） | 关闭落盘时不创建或写入该目录；开启时必须显式配置目录，或提供兼容字段 `LOG_FILE_PATH` |
| `LOG_FILE_PATH`   | 无                                      | 仅兼容旧配置；以 `.log` 结尾时取其父目录，否则按目录处理；优先使用 `LOG_FILE_DIR`    |

## 不落盘日志（默认方式）

```env
LOG_FILE_ENABLE=false
```

关闭文件日志不等于关闭日志服务。业务代码仍使用 `PinoLogger`，无需判断开关，也不需要改成 `console.log` 或调用 `StorageService` 保存每条日志：

- 本地开发 / 测试：彩色日志输出到 stderr，在启动服务的终端查看；没有外部采集时，不提供可跨终端、跨进程查询的历史日志。
- 生产环境：每条日志以结构化 JSON 输出到 stdout，包含 `error` / `fatal`，不是按严重程度分别发送到 stderr。Docker 同时收集进程的 stdout / stderr。
- 不需要配置 `LOG_FILE_DIR`，也不需要挂载应用日志目录；即使示例环境中保留 `LOG_FILE_DIR=./logs`，关闭开关时也不会创建日志文件。生产配置里的 `pino/file` 使用 `destination: 1`，这里指 stdout，不是磁盘路径。

### Docker 中查看日志

按[部署说明](../deployment.md#生产-compose)运行的应用，由 Docker 日志驱动负责接收、保存和轮转输出，应用内不再运行文件轮转。`deploy/docker-compose.yml` 开发 Compose 只提供基础设施，不能用它查看宿主机上 `pnpm start:dev` 的输出。

在生产服务器的 Bash 中，沿用部署文档的目录、项目名和服务名：

```bash
cd /srv/nest-app
export APP_IMAGE="$(<current-image)"
unset ADMIN_IMAGE

# 查看最近 30 分钟内的最后 200 行
docker compose --env-file images.env -p nest-app -f compose.yaml \
  logs --since=30m --tail=200 app

# 从最后 100 行开始持续查看，Ctrl+C 只退出查看，不停止容器
docker compose --env-file images.env -p nest-app -f compose.yaml \
  logs --follow --tail=100 app
```

查看日志也需要解析 Compose 的必填镜像变量；首次发布失败、没有 `current-image` 时，将 `APP_IMAGE` 改用该次发布的镜像 digest。`images.env` 沿用部署文档中的公开镜像变量文件：启用管理后台时保存 `ADMIN_IMAGE`，只部署服务端时可为空；`unset ADMIN_IMAGE` 避免 shell 中的旧值覆盖文件。该文件不保存应用密钥，也不会替代服务自身的 `.env.production`。按时间范围和行数限制输出，避免一次拉取全部日志；参数见 [Docker Compose logs](https://docs.docker.com/reference/cli/docker/compose/logs/)。

需要按 `event` / `req.id` 检索 JSON 时，可在 `logs` 后加 `--no-color --no-log-prefix`，去掉 Compose 展示前缀后再交给 JSON 解析工具；启动失败等非 Pino 输出不一定是 JSON，应保留原始输出用于排查。

### 轮转、容量与历史保留

**应用不落盘，不等于 Docker 宿主机不落盘。** 当前[生产 Compose](../deployment.md#生产-compose)使用 `json-file` 驱动，明确设置 `max-size: '10m'`、`max-file: '3'`：每个容器按文件大小轮转并最多保留 3 个文件，不是保留 3 天，也不是整台服务器的容量上限。Docker 的 `json-file` 默认不限制文件大小，不能只关闭应用文件日志而省略容器侧的容量管理。不要手动修改、截断或删除 Docker 内部日志文件，交给驱动管理。见 [JSON File 驱动说明](https://docs.docker.com/engine/logging/drivers/json-file/)。

- `LOG_FILE_DIR` 和 pino-roll 的 `20m` / `count: 30` 在此模式下不生效；它们只控制下节的应用文件日志。
- 修改日志驱动或轮转配置后，需在经授权的发布中重建对应容器，已有容器不会自动采用新设置；不要为查看日志执行重建、`down` 或清理操作。见 [Docker 日志驱动配置](https://docs.docker.com/engine/logging/configure/)。
- 轮转会淘汰旧日志；删除或替换容器后，不能依赖旧容器日志长期保留。Docker 本地日志只用于近期排障，不是备份或持久审计记录。
- 运维需监控宿主机磁盘、日志增长速度和采集失败；单容器的轮转配置不会替其他容器或服务限制容量。

### 需要集中检索或长期留存时

单机、日志量较小时，先用现有 Docker 轮转和 `logs` 查看即可。有跨发布检索、告警或长期保留需求时，再由独立采集器或远程日志驱动把容器输出发送到日志平台；应用仍保持 `LOG_FILE_ENABLE=false`，无需新增日志模块或在业务请求中同步调用外部日志接口。项目目前未内置集中采集、告警或日志归档任务。

接入时明确以下边界：

- 平台解析 Pino JSON，保留 `event`、`req.id`、`context` 等字段；由采集侧补充应用、环境与版本信息，沿用下文脱敏要求，并配置访问权限、保留期限和容量预算。
- 采集故障可能造成积压或丢失。Docker 默认采用阻塞式日志投递；`non-blocking` 可避免这一级背压阻塞，但缓冲区满会丢弃日志，不保证零丢失。按业务要求选择并监控，不能把普通运行日志当作唯一审计凭据。见 [Docker 日志投递模式](https://docs.docker.com/engine/logging/configure/#configure-the-delivery-mode-of-log-messages-from-container-to-log-driver)。
- 需要 S3 兼容长期归档时，由日志平台或独立运维采集流程批量归档，配置独立凭据、权限和生命周期；不要让业务应用逐条上传日志，也不应把运行日志混入业务文件 bucket。
- 若要求连宿主机日志也不落盘，需要单独设计并验证远程驱动、Docker 缓存和采集器缓冲策略。远程驱动可能仍启用本地双日志缓存；禁用缓存后，`docker logs` 可能无法读取，需改用平台查询。`none` 驱动只是关闭 Docker 日志收集，不是远程保存方案。见 [Docker 双日志缓存](https://docs.docker.com/engine/logging/dual-logging/)和[日志驱动列表](https://docs.docker.com/engine/logging/configure/#supported-logging-drivers)。

### 看不到日志时

先确认当前环境、容器和查询时间范围：生产不输出 `debug`，`/health` 前缀请求不会生成自动请求日志，容器重建后旧输出可能已不在当前容器中。再确认日志驱动未设为 `none`、远程采集及其本地缓存是否正常；不要通过开启文件日志掩盖采集链路故障。

## 可选文件落盘

只有明确需要应用文件日志时才开启；控制台输出仍保留，同时交给 Docker 收集可能形成重复存储，需要一并计算容量。

```env
LOG_FILE_ENABLE=true
LOG_FILE_DIR=./logs
```

`LoggerModule.forRoot({ name })` 的 `name` 默认 `app`，用于构成传给 pino-roll 的基础路径 `${LOG_FILE_DIR}/${name}.log`，实际文件追加日期及轮转序号。文件策略为：

- 按天轮转，日期格式 `yyyy-MM-dd`；单文件超过 `20m` 继续切分。
- 轮转保留参数为 `limit.count: 30`、`removeOtherLogFiles: false`，针对当前 transport 创建的历史文件，不删除同目录其他日志。该数量不包含当前文件，也不是保留 30 天或整个目录的文件总数上限；进程重启前的旧文件需另行管理。
- 自动创建日志目录。

## 日志字段与级别

`msg` 使用中文一句话摘要，`event` / `reason` 使用稳定的英文标识。业务上下文、关联 ID 和耗时放结构化字段，不拼接进消息。仅记录排障所需的数据，安全边界见 [安全与工程底线](../development/engineering-conventions.md)。

```typescript
this._logger.info(
  { event: 'order_created', orderId, durationMs: 45 },
  '订单创建成功',
);
```

| 级别    | 常用场景                             |
| ------- | ------------------------------------ |
| `debug` | 排障细节，生产配置不输出             |
| `info`  | 正常业务事件、单次预期失败           |
| `warn`  | 短时多次失败、风控命中、疑似配置错误 |
| `error` | 程序异常、依赖超时、5xx 错误         |
| `fatal` | 服务不可用                           |

## 脱敏与请求日志

所有环境在写入控制台或文件 transport 前，将下列**指定路径**的值替换为 `[Redacted]`：

- `req.headers.authorization`
- `req.headers.cookie`
- `res.headers["set-cookie"]`
- 顶层 `password`

`error` / `err` 只保留 `name`、`message`、`stack`、`code` 诊断字段；`cause` 使用相同规则，最多展开三层错误并检测循环。不会复制错误附带的 `command`、`client`、任意嵌套 token 等属性，避免 Redis 命令参数或数据库连接对象进入日志。

错误对象直接进入上述白名单处理，不经过 Pino 默认错误预序列化，以兼容冻结对象和抛错 getter。请求与响应仍显式使用 Pino 标准序列化器，保留状态码等日志字段，不原样展开请求体、会话或响应附带对象。

这些规则不覆盖其他路径下的任意嵌套密码、请求体或敏感字段，也无法清除手工拼进 `message` / `stack` 的凭据。调用处仍不得记录凭证、完整请求体、连接串或带授权参数的 URL；错误字段白名单不是通用内容脱敏器。

每个请求由服务端新生成 UUID v4，日志中的 `req.id` 与响应头 `X-Request-Id` 一致，不信任客户端传入的请求 ID。当前自动请求日志跳过所有 URL 以 `/health` 开头的请求。

若跨域浏览器需要读取 `X-Request-Id`，还需按实际需求配置 CORS `exposedHeaders`；当前 [main.ts](../../apps/server/src/main.ts) 未暴露此响应头。
