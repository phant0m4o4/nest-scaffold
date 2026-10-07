# 环境变量与配置

本页描述 `apps/server` 的服务端配置，示例维护在 [apps/server/.env.example](../../apps/server/.env.example)，本地文件为 `apps/server/.env`。根目录的服务端启动与 `db:*` 命令会在该应用目录执行；从旧版单应用结构迁移时，应保留已有配置并移动到这个位置，不要复制到前端，也不用示例覆盖已有凭证。部署时由运行环境提供实际值。变量校验与默认值以 [服务端配置](../../apps/server/src/configs)为准。

管理后台和手机端分别使用自己的 `.env.example` / `.env`，规则见[前端开发](frontends.md#环境变量与联调)。`VITE_*` 与 `EXPO_PUBLIC_*` 会进入客户端产物，不能包含本页的数据库、Storage、主密钥等服务端秘密。

`ConfigModule.forRoot({ expandVariables: true })` 支持在 `.env` 中引用 `${APP_NAME}`、`${REDIS_HOST}` 等变量。

`pnpm dev:server`、`pnpm start:dev` 和 `pnpm start:debug` 已设置 `NODE_ENV=development`；`pnpm start` / `pnpm start:dist` 不设置该值，需由运行环境明确提供。模板未逐项列出所有可选变量，以下表格同时记录代码中的默认值；生产镜像已设置 `NODE_ENV=production`。

## 新增配置

使用 [registerEnvAsConfig](../../apps/server/src/common/utils/register-env-as-config.ts) 把环境变量校验与业务配置映射集中到 `apps/server/src/configs/<name>.config.ts`，不要在业务服务中零散读取 `process.env`。

```ts
import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { optionalEnvInt } from '@/common/utils/zod/optional-env-int';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

const environmentSchema = z.object({
  MY_HOST: z.string().min(1),
  MY_PORT: optionalEnvInt(1).refine(
    (port) => port === undefined || port <= 65535,
    '端口不能超过 65535',
  ),
});

const myConfig = registerEnvAsConfig('my', environmentSchema, (env) => ({
  host: env.MY_HOST,
  port: env.MY_PORT ?? 8080,
}));

export type MyConfigType = ConfigType<typeof myConfig>;
export default myConfig;
```

模块使用 `ConfigModule.forFeature(myConfig)` 加载，注入配置时保留类型。数字、布尔和枚举要显式解析；条件必填用 `.superRefine()` 或配置解析函数校验。空字符串不一定等于未设置，需要按变量语义处理。新增 API 变量同时更新 `apps/server/.env.example` 和相关测试。

## 应用与安全

| 变量                        | 默认值 / 要求                                                               |
| --------------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`                  | 必填：`development` / `test` / `production`                                 |
| `APP_NAME`                  | 必填                                                                        |
| `APP_PORT` / `APP_ADDRESS`  | `3000` / `127.0.0.1`；端口只接受 `1–65535` 的整数                           |
| `APP_BASE_URL`              | 根据地址与端口生成                                                          |
| `APP_CORS_DOMAINS`          | 逗号分隔来源；生产环境为空默认拒绝启动                                      |
| `APP_CORS_CREDENTIALS`      | `true`；生产环境与 `*` 来源并用时默认拒绝启动                               |
| `APP_CORS_MANAGED_BY_PROXY` | `false`；仅可信上游实际接管 CORS 时才豁免上述检查                           |
| `APP_TRUST_PROXY`           | `false`；部署在反向代理后时按实际代理层数或地址配置                         |
| `APP_MASTER_KEY`            | 必填：64 位十六进制高熵密钥；使用 `openssl rand -hex 32` 生成，不使用示例值 |

`APP_MASTER_KEY` 解码为 32 字节后直接用于 AES-256-GCM，不是口令派生。生产环境会拒绝 `.env.example` 中公开的示例主密钥（忽略 hex 大小写）；开发和测试仍可使用。该检查不代表能够判断其他密钥的熵，部署时仍须独立随机生成。更换密钥会使旧加密游标无法解码，部署时需考虑客户端重新分页。

## 数据库

默认装配 MySQL；PostgreSQL 按实际项目需要切换或显式装配，见 [数据库](database.md)。

- MySQL：`MYSQL_HOST` 默认 `127.0.0.1`，`MYSQL_PORT` 默认 `3306`；`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD` 必填。
- PostgreSQL：`PGSQL_HOST` 默认 `127.0.0.1`，`PGSQL_PORT` 默认 `5432`；`PGSQL_DATABASE`、`PGSQL_USER`、`PGSQL_PASSWORD` 必填。
- 两种数据库端口均只接受 `1–65535` 的整数；未设置或空白仍使用默认端口，越界值在配置加载时拒绝。
- 数据库名可用 `${APP_NAME}`；两份 Drizzle Kit 配置也处理这一占位。

以上是 Nest 运行时校验。Drizzle Kit 的 `db:generate:*` / `db:migrate:*` 使用应用目录内的独立配置，通过 `dotenv` 读取 `apps/server/.env`，不会执行 Nest 的 Zod 校验或通用变量展开；数据库名的 `${APP_NAME}` 是配置中特别处理的占位。迁移前仍需核对命令实际使用的连接目标，不能依赖应用启动校验替代检查。

## Redis：单机或哨兵

`REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` 只是示例中的公共锚点，应用不直接读取它们。各模块只读取自己的命名空间，缺失时不会回退到其他模块配置。

| 模块            | 连接前缀                 | 示例 DB |
| --------------- | ------------------------ | ------- |
| 缓存            | `CACHE_REDIS`            | `0`     |
| 分布式锁        | `DISTRIBUTED_LOCK_REDIS` | `1`     |
| 队列            | `QUEUE_REDIS`            | `2`     |
| 可选 Redis 限流 | `BOTTLENECK_REDIS`       | `3`     |

将下表 `<P>` 替换为对应前缀：

| 变量                       | 规则                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `<P>_MODE`                 | 默认 `single`；只允许 `single` / `sentinel`                           |
| `<P>_HOST` / `<P>_PORT`    | single 模式必填，端口为 1–65535 的整数                                |
| `<P>_PASSWORD`             | Redis 密码，可选                                                      |
| `<P>_DB`                   | 两种模式均必填                                                        |
| `<P>_SENTINEL_MASTER_NAME` | sentinel 模式必填，主节点组名                                         |
| `<P>_SENTINELS`            | sentinel 模式必填，`host:port,host:port`，端口为 1–65535 的十进制整数 |

哨兵切换示例见 [.env.example](../../apps/server/.env.example)。不支持 Cluster。

缓存、锁、队列等使用不同 DB，避免误清理互相影响；**DB 编号不能隔离实例级淘汰策略、内存或故障**。锁与队列不能被缓存淘汰，应使用 `noeviction`；缓存确需淘汰策略时使用独立实例。具体安全边界见 [基础设施](infra-modules.md)。

## Storage

`StorageModule` 非全局且默认未装配，统一导出 `StorageService` 和 `UploaderService`；业务模块按需导入后才校验以下变量。两个服务使用同一套 Storage 配置，客户端不回退到 `AWS_*`、本机凭据文件或默认云身份。配置步骤与流的资源释放见 [Storage 模块](../modules/storage.md)，浏览器直传见 [UploaderService](../modules/storage.md#浏览器直传)。

| 变量                                                        | 默认值 / 要求                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `STORAGE_S3_ENDPOINT`                                       | 必填；HTTP(S) 服务地址，不含凭据、路径前缀、查询或片段；生产必须 HTTPS                                     |
| `STORAGE_S3_PUBLIC_ENDPOINT`                                | 可选，默认使用 `STORAGE_S3_ENDPOINT`；预签名使用的浏览器可达地址，须指向同一 bucket；校验要求同 endpoint   |
| `STORAGE_S3_REGION`                                         | `us-east-1`，按服务商调整                                                                                  |
| `STORAGE_S3_BUCKET`                                         | 必填，3–63 字符的小写 bucket 名；应用不自动创建                                                            |
| `STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` | 必填，应用专用凭据                                                                                         |
| `STORAGE_S3_SESSION_TOKEN`                                  | 临时凭据按需提供；不自动刷新                                                                               |
| `STORAGE_S3_FORCE_PATH_STYLE`                               | `false`；仅接受 `true` / `false`，本地 SeaweedFS 示例设为 `true`                                           |
| `STORAGE_MAX_UPLOAD_BYTES`                                  | `104857600`（100 MiB），单个对象大小上限，允许空对象；预签名 PUT 还受 5 GiB 单次上限约束，不提供浏览器分片 |
| `STORAGE_MAX_BUFFER_BYTES`                                  | `5242880`（5 MiB），完整读取到内存的上限；单次 `maxBytes` 只能收紧                                         |
| `STORAGE_UPLOAD_TIMEOUT_MS`                                 | `120000`，服务端 `put` 整体超时；失败后的分片清理另有至多 5 秒时限，不控制浏览器直传                       |
| `STORAGE_REQUEST_TIMEOUT_MS`                                | `30000`，连接和请求超时；`get` 还覆盖响应体读取全过程                                                      |
| `STORAGE_MAX_CONCURRENT_UPLOADS`                            | `4`，单个服务实例的 `put` 并发上限，超限直接拒绝；不控制浏览器直传                                         |
| `STORAGE_PRESIGN_EXPIRES_SECONDS`                           | `300`，预签名链接有效期（秒），只允许 `1–900`；单次 `expiresInSeconds` 只能收紧                            |

大小、超时与并发必须为正安全整数；两个超时不能超过 Node.js 定时器上限 `2147483647` 毫秒。完整可复制示例见 [.env.example](../../apps/server/.env.example)，不要使用其中的本地开发凭据访问生产 bucket。生产凭据不授予备份仓库或 bucket 管理权限。

public endpoint 必须在签名前配置，不能在生成链接后替换 host。浏览器直传还需要由管理员配置[独立的 bucket CORS](../modules/storage.md#bucket-cors)，不能靠 Nest 的 `APP_CORS_*` 代替。

## 其他配置

| 配置                                         | 默认值与说明                                                   |
| -------------------------------------------- | -------------------------------------------------------------- |
| `CACHE_TTL_SECONDS` / `CACHE_KEY_PREFIX`     | `604800` 秒 / `cache`                                          |
| `DISTRIBUTED_LOCK_KEY_PREFIX`                | `distributed-lock`；TTL、重试、续期参数在调用 `using()` 时指定 |
| `QUEUE_KEY_PREFIX` / `QUEUE_DASHBOARD_ROUTE` | `queue` / `/queues`；仪表盘仅开发环境启用                      |
| `LOG_FILE_ENABLE`                            | `false`；启用时需显式设置日志目录                              |
| `LOG_FILE_DIR`                               | 新配置统一使用该字段；旧 `LOG_FILE_PATH` 仅兼容保留            |
| `I18N_FALLBACK_LANGUAGE`                     | `en`                                                           |
| `BOTTLENECK_MODE`                            | `memory`；模块默认未装配，改为 `redis` 才要求 Redis 连接配置   |
| `BOTTLENECK_REDIS_KEY_PREFIX`                | `bottleneck`                                                   |

`LOG_FILE_DIR=./logs` 相对服务端进程工作目录解析；通过根服务端命令启动时，对应 `apps/server/logs`。关闭文件日志时不会创建该目录，生产沿用 stdout / stderr。

不把真实 `.env`、密码、密钥或连接串写入文档、日志和测试快照。配置错误信息只输出变量名与必要原因。
