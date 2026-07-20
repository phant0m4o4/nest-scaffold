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

## Redis（RedisModule，全局共享）

| 变量 | 模式 | 默认 | 说明 |
|------|------|------|------|
| `REDIS_MODE` | — | `single` | `single` / `sentinel` / `cluster` |
| `REDIS_PASSWORD` | 全部 | — | 鉴权 |
| `REDIS_DB` | single/sentinel | `0` | DB 编号 |
| `REDIS_HOST` | single | `127.0.0.1` | |
| `REDIS_PORT` | single | `6379` | |
| `REDIS_SENTINEL_MASTER_NAME` | sentinel | — | 必填 |
| `REDIS_SENTINELS` | sentinel | — | `host:port,host:port` |
| `REDIS_CLUSTER_NODES` | cluster | — | `host:port,host:port` |

## CacheModule

| 变量 | 默认 | 说明 |
|------|------|------|
| `CACHE_TTL_SECONDS` | `604800`（7 天） | 默认 TTL |
| `CACHE_KEY_PREFIX` | `cache` | 键前缀 |

## DistributedLockModule

| 变量 | 默认 | 说明 |
|------|------|------|
| `DISTRIBUTED_LOCK_KEY_PREFIX` | `distributed-lock` | 锁键前缀 |

## QueueModule（独享 Redis 连接）

| 变量 | 默认 | 说明 |
|------|------|------|
| `QUEUE_REDIS_HOST` | `${REDIS_HOST}` | BullMQ 专用主机 |
| `QUEUE_REDIS_PORT` | `${REDIS_PORT}` | |
| `QUEUE_REDIS_PASSWORD` | `${REDIS_PASSWORD}` | |
| `QUEUE_REDIS_DB` | `0` | |
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

#Redis（全应用共享）
REDIS_MODE=single
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis_password
REDIS_DB=0

#Log
LOG_FILE_ENABLE=true
LOG_FILE_PATH=./logs/app.log

#Cache
CACHE_TTL_SECONDS=604800
CACHE_KEY_PREFIX=cache

#Distributed Lock
DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock

#Queue（独立连接，默认引用上方 REDIS_*）
QUEUE_REDIS_HOST=${REDIS_HOST}
QUEUE_REDIS_PORT=${REDIS_PORT}
QUEUE_REDIS_PASSWORD=${REDIS_PASSWORD}
QUEUE_REDIS_DB=0
QUEUE_KEY_PREFIX=queue
QUEUE_DASHBOARD_ROUTE=/queues

#I18n（可选，默认 en）
# I18N_FALLBACK_LANGUAGE=en

#Bottleneck（可选模块，默认未装配；mode 为 memory 或 redis）
# BOTTLENECK_MODE=memory
```
