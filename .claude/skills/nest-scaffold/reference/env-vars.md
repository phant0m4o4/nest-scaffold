# 环境变量清单

`.env` 文件分组管理；`.env.example` 是入库模板，`.env` **不入库**。`ConfigModule.forRoot({ expandVariables: true })` 已开，可在 `.env` 里互相引用（`${REDIS_HOST}` 等）。

## 配置注册方式

每组配置都通过 `registerEnvAsConfig(namespace, zodSchema, mapper)` 注册，使用 `zod` schema 校验。

模板：

```ts
// src/configs/<name>.config.ts
import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

const environmentSchema = z.object({
  MY_HOST: z.string().min(1),
  MY_PORT: z.coerce.number().int().optional(),
});

const myConfig = registerEnvAsConfig('my', environmentSchema, (env) => ({
  host: env.MY_HOST,
  port: env.MY_PORT ?? 8080,
}));

export type MyConfigType = ConfigType<typeof myConfig>;
export default myConfig;
```

常用写法：

- 数字：`z.coerce.number().int()`（环境变量都是字符串，需 coerce）。
- 布尔：`z.stringbool()`（识别 `true`/`false` 等字符串形式）。
- 枚举：`z.enum([...])`。
- 条件必填（如某模式下才必填）：在 schema 上挂 `.superRefine()`。

校验失败启动直接报错，列出具体哪个变量哪条规则不通过。

`AppModule` 中通过 `ConfigModule.forRoot({ load: [appConfig, ...其他 config] })` 加载；模块级别可用 `ConfigModule.forFeature(myConfig)` 局部加载。

## 应用基础配置

| 变量 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `NODE_ENV` | enum | — | `development` / `test` / `production` |
| `APP_NAME` | string | — | 应用名（必填） |
| `APP_PORT` | int | `3000` | 监听端口 |
| `APP_ADDRESS` | string | `127.0.0.1` | 监听地址 |
| `APP_BASE_URL` | string | `http://${APP_ADDRESS}:${APP_PORT}` | 基础 URL |

## MySQL（DatabaseModule）

| 变量 | 默认 | 说明 |
|------|------|------|
| `MYSQL_HOST` | `127.0.0.1` | |
| `MYSQL_PORT` | `3306` | |
| `MYSQL_DATABASE` | — | 必填，可写 `${APP_NAME}` 占位（drizzle-mysql.config.ts 会替换） |
| `MYSQL_USER` | — | |
| `MYSQL_PASSWORD` | — | |

## PostgreSQL（database/pgsql DatabaseModule）

| 变量 | 默认 | 说明 |
|------|------|------|
| `PGSQL_HOST` | `127.0.0.1` | |
| `PGSQL_PORT` | `5432` | |
| `PGSQL_DATABASE` | — | 必填，可写 `${APP_NAME}` 占位（drizzle-pgsql.config.ts 会替换） |
| `PGSQL_USER` | — | |
| `PGSQL_PASSWORD` | — | |

## Redis 公共锚点变量（应用不直接读取）

`REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` 仅作为 `.env` 内的锚点，供各模块的 `*_REDIS_*` 通过 `${REDIS_HOST}` 引用，避免重复书写地址。**每个需要 Redis 的模块只读自己命名空间的连接配置**（`CACHE_REDIS_*` / `DISTRIBUTED_LOCK_REDIS_*` / `QUEUE_REDIS_*`），必填缺失直接启动报错，不回退读其他模块。

各模块连接配置的通用形态（`<P>` 为模块前缀，如 `CACHE_REDIS`）：

| 变量 | 模式 | 说明 |
|------|------|------|
| `<P>_MODE` | — | `single`（默认）/ `sentinel` / `cluster` |
| `<P>_HOST` / `<P>_PORT` | single | 必填 |
| `<P>_PASSWORD` | 全部 | 可选 |
| `<P>_DB` | single/sentinel | 必填，模块专用 DB（互相禁止共用） |
| `<P>_SENTINEL_MASTER_NAME` / `<P>_SENTINELS` | sentinel | 必填，`host:port,host:port` |
| `<P>_CLUSTER_NODES` | cluster | 必填，`host:port,host:port` |

## CacheModule

| 变量 | 默认 | 说明 |
|------|------|------|
| `CACHE_TTL_SECONDS` | `604800`（7 天） | 默认 TTL |
| `CACHE_KEY_PREFIX` | `cache` | 键前缀 |
| `CACHE_REDIS_*` | 见上文通用形态 | 自带连接配置（HOST/PORT/DB 必填）。缓存可随时清空，禁止与锁/队列等共用一个 DB（cluster 模式无 DB 概念，需独立集群） |

## DistributedLockModule（独立 Redis 连接）

| 变量 | 默认 | 说明 |
|------|------|------|
| `DISTRIBUTED_LOCK_KEY_PREFIX` | `distributed-lock` | 锁键前缀 |
| `DISTRIBUTED_LOCK_REDIS_*` | 见上文通用形态 | 自带连接配置（HOST/PORT/DB 必填）。锁数据不可丢，禁止与缓存等可清空数据共用 DB（cluster 模式无 DB 概念，需独立实例） |

## QueueModule（独享 Redis 连接，自带配置）

| 变量 | 默认 | 说明 |
|------|------|------|
| `QUEUE_REDIS_HOST` | —（必填） | BullMQ 专用主机，可引用 `${REDIS_HOST}` 锚点 |
| `QUEUE_REDIS_PORT` | —（必填） | |
| `QUEUE_REDIS_PASSWORD` | — | 可选 |
| `QUEUE_REDIS_DB` | —（必填） | 队列专用 DB，禁止与缓存/锁共用（推荐 `2`） |
| `QUEUE_KEY_PREFIX` | `queue` | 队列 key 前缀 |
| `QUEUE_DASHBOARD_ROUTE` | `/queues` | Bull Board 路由（仅开发环境） |

## LoggerModule

| 变量 | 默认 | 说明 |
|------|------|------|
| `LOG_FILE_ENABLE` | `false` | 是否落盘 |
| `LOG_FILE_PATH` | `${process.cwd()}/logs` | 日志目录 |

## I18nModule

| 变量 | 默认 | 说明 |
|------|------|------|
| `I18N_FALLBACK_LANGUAGE` | `en` | 兜底语言 |

## BottleneckModule（可选，默认未在 AppModule 装配）

| 变量 | 默认 | 说明 |
|------|------|------|
| `BOTTLENECK_MODE` | `memory` | `memory` / `redis` |
| `BOTTLENECK_REDIS_KEY_PREFIX` | `bottleneck` | 仅 redis 模式 |
| `BOTTLENECK_REDIS_HOST` | `127.0.0.1` | 仅 redis 模式 |
| `BOTTLENECK_REDIS_PORT` | `6379` | 仅 redis 模式 |
| `BOTTLENECK_REDIS_PASSWORD` | — | 仅 redis 模式，可空 |
| `BOTTLENECK_REDIS_DB` | `0` | 仅 redis 模式 |

## .env 完整示例

```env
APP_NAME=my-api
APP_PORT=3000

#MySQL
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=${APP_NAME}
MYSQL_USER=root
MYSQL_PASSWORD=root_password

#PostgreSQL（可选，与 MySQL 平行的数据源）
PGSQL_HOST=127.0.0.1
PGSQL_PORT=5432
PGSQL_DATABASE=${APP_NAME}
PGSQL_USER=postgres
PGSQL_PASSWORD=root_password

#Redis 公共锚点变量（应用不直接读取，仅供下方 *_REDIS_* 引用）
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

#Log
LOG_FILE_ENABLE=true
LOG_FILE_PATH=./logs/app.log

#Cache（自带连接配置，独立 DB）
CACHE_TTL_SECONDS=604800
CACHE_KEY_PREFIX=cache
CACHE_REDIS_HOST=${REDIS_HOST}
CACHE_REDIS_PORT=${REDIS_PORT}
CACHE_REDIS_PASSWORD=${REDIS_PASSWORD}
CACHE_REDIS_DB=1

#Distributed Lock（自带连接配置，独立 DB）
DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock
DISTRIBUTED_LOCK_REDIS_HOST=${REDIS_HOST}
DISTRIBUTED_LOCK_REDIS_PORT=${REDIS_PORT}
DISTRIBUTED_LOCK_REDIS_PASSWORD=${REDIS_PASSWORD}
DISTRIBUTED_LOCK_REDIS_DB=0

#Queue（自带连接配置，独立 DB）
QUEUE_REDIS_HOST=${REDIS_HOST}
QUEUE_REDIS_PORT=${REDIS_PORT}
QUEUE_REDIS_PASSWORD=${REDIS_PASSWORD}
QUEUE_REDIS_DB=2
QUEUE_KEY_PREFIX=queue
QUEUE_DASHBOARD_ROUTE=/queues

#I18n（可选，默认 en）
# I18N_FALLBACK_LANGUAGE=en

#Bottleneck（可选模块，默认未装配；mode 为 memory 或 redis）
# BOTTLENECK_MODE=memory
```
