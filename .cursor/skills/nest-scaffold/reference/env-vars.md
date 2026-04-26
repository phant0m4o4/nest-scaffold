# 环境变量清单

`.env` 文件分组管理；`.env.example` 是入库模板，`.env` **不入库**。`ConfigModule.forRoot({ expandVariables: true })` 已开，可在 `.env` 里互相引用（`${REDIS_HOST}` 等）。

## 配置注册方式

每组配置都通过 `registerEnvAsConfig(namespace, EnvironmentVariablesClass, mapper)` 注册，使用 `class-transformer` + `class-validator` 校验。

模板：

```ts
// src/configs/<name>.config.ts
import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsNotEmpty } from 'class-validator';

class EnvironmentVariables {
  @Expose() @IsString() @IsNotEmpty()
  MY_HOST: string;

  @Expose() @IsInt() @IsOptional()
  MY_PORT?: number;
}

const myConfig = registerEnvAsConfig('my', EnvironmentVariables, (env) => ({
  host: env.MY_HOST,
  port: env.MY_PORT ?? 8080,
}));

export type MyConfigType = ConfigType<typeof myConfig>;
export default myConfig;
```

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
| `MYSQL_DATABASE` | — | 必填，可写 `${APP_NAME}` 占位（drizzle.config.ts 会替换） |
| `MYSQL_USER` | — | |
| `MYSQL_PASSWORD` | — | |

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
```
