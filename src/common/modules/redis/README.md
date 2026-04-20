# RedisModule

全应用共享的 Redis 模块，基于 [`ioredis`](https://github.com/redis/ioredis) 暴露一个单例客户端，统一处理连接、健康检查、断开与日志。

## 功能特性

- **三种连接方式** —— `single` / `sentinel` / `cluster`，由 `REDIS_MODE` 环境变量切换
- **单例共享** —— 全应用唯一 `Redis | Cluster` 实例，业务通过 `RedisService.getClient()` 获取
- **生命周期托管** —— `onModuleInit` 创建客户端 + `PING` 健康检查；`onModuleDestroy` 优雅关闭
- **结构化日志** —— `connect` / `ready` / `error` / `close` 事件均通过 `PinoLogger` 输出
- **配置复用** —— 复用 `@/configs/redis.config.ts`，无需重复定义

## 环境变量

| 变量                         | 类型   | 默认值      | 适用模式            | 说明                                     |
| ---------------------------- | ------ | ----------- | ------------------- | ---------------------------------------- |
| `REDIS_MODE`                 | string | `single`    | -                   | 连接方式：`single` / `sentinel` / `cluster` |
| `REDIS_PASSWORD`             | string | —           | 全部                | 鉴权密码（可选）                         |
| `REDIS_DB`                   | number | `0`         | single / sentinel   | 数据库编号                               |
| `REDIS_HOST`                 | string | `127.0.0.1` | single              | Redis 主机地址                           |
| `REDIS_PORT`                 | number | `6379`      | single              | Redis 端口                               |
| `REDIS_SENTINEL_MASTER_NAME` | string | —           | sentinel（必填）    | Sentinel 中的 master 名称                |
| `REDIS_SENTINELS`            | string | —           | sentinel（必填）    | Sentinel 节点列表，格式：`host:port,host:port` |
| `REDIS_CLUSTER_NODES`        | string | —           | cluster（必填）     | Cluster 节点列表，格式：`host:port,host:port`  |

## 三种模式 `.env` 示例

### single

```dotenv
REDIS_MODE=single
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

### sentinel

```dotenv
REDIS_MODE=sentinel
REDIS_SENTINEL_MASTER_NAME=mymaster
REDIS_SENTINELS=10.0.0.1:26379,10.0.0.2:26379,10.0.0.3:26379
REDIS_PASSWORD=secret
REDIS_DB=0
```

### cluster

```dotenv
REDIS_MODE=cluster
REDIS_CLUSTER_NODES=10.0.0.1:7000,10.0.0.2:7001,10.0.0.3:7002
REDIS_PASSWORD=secret
```

## 快速开始

### 1. 注册模块（已在 `AppModule` 接入）

```typescript
import { RedisModule } from '@/common/modules/redis/redis.module';

@Module({
  imports: [RedisModule],
})
export class AppModule {}
```

`RedisModule` 已标记 `@Global()`，整个应用只需注册一次；模块内部已自动通过 `ConfigModule.forFeature(redisConfig)` 加载 Redis 配置，无需额外处理。

### 2. 注入并使用 `RedisService`

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '@/common/modules/redis/redis.service';

@Injectable()
export class FooService {
  constructor(private readonly redisService: RedisService) {}

  async demo(): Promise<string | null> {
    const client = this.redisService.getClient();
    await client.set('foo', 'bar');
    return await client.get('foo');
  }
}
```

> 类型 `RedisClient = Redis | Cluster`。Cluster 与单机在少数命令上行为不同，需要时可在使用处通过 `instanceof Cluster` 收窄。

## 优雅关闭说明

为了让进程接收到 `SIGTERM` / `SIGINT` 时能触发 `onModuleDestroy` 优雅关闭 Redis 连接，必须在 `main.ts` 中启用：

```typescript
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
```

本仓库的 `src/main.ts` 已默认启用，无需额外配置。

## 与现有模块的关系

`CacheModule` / `DistributedLockModule` / `QueueModule` 历史上各自维护独立的 Redis 连接，本模块**不**自动接管它们的连接，仅作为通用共享 Redis 客户端供新业务使用，避免大范围迁移风险。

## 测试

- 单元：`pnpm test src/common/modules/redis/__tests__/redis.factory.spec.ts`
- 单元：`pnpm test src/common/modules/redis/__tests__/redis.service.spec.ts`
- 集成：`pnpm test:e2e src/common/modules/redis/__tests__/redis.module.e2e-spec.ts`
  - 依赖本机 Docker：使用 `testcontainers` 启动 `redis:7-alpine` 容器并跑真实命令

## 目录结构

```
redis/
├── README.md
├── redis.module.ts          # @Global 模块定义
├── redis.service.ts         # 单例服务（生命周期 + getClient）
├── redis.factory.ts         # 三种模式构造与优雅关闭工具函数
├── redis.types.ts           # RedisClient = Redis | Cluster
└── __tests__/
    ├── redis.factory.spec.ts
    ├── redis.service.spec.ts
    └── redis.module.e2e-spec.ts
```
