# BottleneckModule

[源码](../../src/common/modules/bottleneck/) · [配置](../../src/configs/bottleneck.config.ts) · [基础设施选型](../development/infra-modules.md)

基于 [bottleneck](https://github.com/SGrondin/bottleneck) 库的通用限流模块，支持内存模式（单机）和 Redis 模式（分布式多实例共享）。

## 功能特性

- **双模式** — 内存模式适用于单机场景；Redis 模式支持多实例共享限流状态
- **并发控制** — `maxConcurrent` 限制同时执行的任务数量
- **速率限制** — `minTime` 控制两次任务执行之间的最小间隔
- **令牌桶** — `reservoir` / `reservoirRefreshInterval` 支持突发流量处理
- **限流器复用** — 相同 key 自动复用已创建的 Bottleneck 实例
- **Redis 共享连接** — 所有限流器共享一个 `IORedisConnection`，减少连接数
- **生命周期管理** — 启动时自动建连，销毁时自动清理所有限流器和连接

## 应用场景

| 场景                | 配置示例                                                                         | 说明                                                       |
| ------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **第三方 API 调用** | `maxConcurrent: 10, minTime: 100`                                                | 外部 API 有速率限制，需控制并发和频率防止被封禁            |
| **数据库批量操作**  | `maxConcurrent: 5`                                                               | 大批量导入/导出时限制并发连接数，避免打满连接池            |
| **邮件/短信发送**   | `reservoir: 100, reservoirRefreshAmount: 100, reservoirRefreshInterval: 3600000` | 按小时配额发送，令牌桶控制每小时上限                       |
| **爬虫/数据采集**   | `maxConcurrent: 3, minTime: 500`                                                 | 控制对目标站点的请求频率，避免触发反爬策略                 |
| **微服务间 RPC**    | `maxConcurrent: 20`                                                              | 下游服务处理能力有限，限制并发调用防止雪崩                 |
| **文件处理**        | `maxConcurrent: 2`                                                               | CPU/IO 密集型操作（如图片压缩、PDF 生成）限制并发          |
| **支付渠道调用**    | `maxConcurrent: 1, minTime: 1000`                                                | 控制并发和调用间隔；防重复扣款仍依赖数据库约束与渠道幂等键 |

## 限流原理与机制

### 并发控制（maxConcurrent）

限制同一时刻正在执行的任务数量。当任务数达到上限时，新任务进入队列排队等待。

```
maxConcurrent = 3

时间线 ─────────────────────────────────►
slot 1: [task-1]     [task-4]     [task-7]
slot 2: [task-2]       [task-5]
slot 3: [task-3]         [task-6]
         ↑                ↑
       3 个并发           task-4 等 task-1 完成后才开始
```

### 速率限制（minTime）

控制两次任务执行之间的最小时间间隔（毫秒）。即使有空闲并发槽位，也必须等待间隔时间后才能执行下一个任务。

```
minTime = 200ms

时间线(ms)  0    200    400    600
           [t1]  [t2]   [t3]   [t4]
            ├─200ms─┤─200ms─┤─200ms─┤
```

### 令牌桶（reservoir）

系统维护一个有限容量的令牌桶，每次执行任务消耗一个令牌。令牌耗尽后任务排队等待，直到令牌按配置的时间间隔和数量自动补充。适合"每 N 分钟最多 M 次"的配额场景。

```
reservoir = 5, refreshInterval = 60s, refreshAmount = 5

  令牌数
  5 ┤■■■■■
  4 ┤■■■■
  3 ┤■■■      ← 消耗 2 个令牌
  2 ┤■■
  1 ┤■
  0 ┤          ← 令牌耗尽，新任务排队
    └──────────┬──── 60s 后 ──────────
               ↓
  5 ┤■■■■■    ← 令牌补充到 5，排队任务恢复执行
```

### 溢出策略（strategy + highWater）

当队列长度超过 `highWater` 高水位线时，按 `strategy` 策略处理：

| 策略                                    | 值  | 行为                                                                   |
| --------------------------------------- | --- | ---------------------------------------------------------------------- |
| `Bottleneck.strategy.LEAK`              | 1   | 丢弃最低优先级中最旧的排队任务；若队列任务都比新任务重要，则拒绝新任务 |
| `Bottleneck.strategy.OVERFLOW_PRIORITY` | 4   | 只丢弃优先级低于新任务的排队任务；没有候选时拒绝新任务                 |
| `Bottleneck.strategy.OVERFLOW`          | 3   | 拒绝新提交的任务                                                       |
| `Bottleneck.strategy.BLOCK`             | 2   | 丢弃全部排队任务并拒绝新任务，直到持续 `penalty` 毫秒无新任务才解封    |

### 组合使用

实际场景通常组合多种机制：

```typescript
this._bottleneckService.createLimiter('third-party-api', {
  maxConcurrent: 5, // 最多 5 个并发请求
  minTime: 200, // 每 200ms 最多发起 1 个请求
  reservoir: 100, // 初始 100 个令牌
  reservoirRefreshAmount: 100, // 每次补充 100 个
  reservoirRefreshInterval: 60_000, // 每 60 秒补充一次
  highWater: 50, // 队列超过 50 时触发溢出策略
  strategy: 3, // OVERFLOW — 拒绝新任务
});
// 效果：最大 5 并发 + 启动间隔至少 200ms + 每次刷新后可用配额 100 + 本地排队上限 50
```

`reservoirRefreshInterval` 应为 `250` 毫秒的倍数，Redis 模式下应为 `5000` 毫秒的倍数。刷新会把令牌数重置为 `reservoirRefreshAmount`，不是在原值上累加，也不是任意滚动时间窗口内的严格次数上限；仍应结合 `minTime` / `maxConcurrent` 避免集中启动。

### 分布式限流（Redis 模式）

内存模式的限流状态仅在单个进程内有效。当应用多实例部署时，每个实例各自独立限流，全局实际吞吐量 = 单实例限额 × 实例数。

Redis 模式将限流状态（当前并发数、令牌桶和配置）存储在 Redis 中。连接同一 Redis DB、使用相同 key 前缀与 limiter key 的实例共享限额：

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Instance 1 │   │  Instance 2 │   │  Instance 3 │
│ Bottleneck  │   │ Bottleneck  │   │ Bottleneck  │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └────────┬────────┴────────┬────────┘
                │   Redis (共享)   │
                │  ┌────────────┐ │
                └──│ 并发计数    │──┘
                   │ 令牌桶      │
                   │ 限流配置    │
                   └────────────┘
```

任务函数和排队任务仍保留在各进程内存中，进程退出后会丢失；优先级和 `highWater` 也是本地队列行为，不是持久化任务队列。一个实例进入 `BLOCK` 会使共享限流器一起进入阻塞期。需要持久化、重试或跨进程消费的任务应使用 [QueueModule](queue.md)。

## 环境变量

完整配置模板见 [.env.example](../../.env.example)。`BOTTLENECK_MODE=memory` 时不要求 Redis 连接变量；下表连接必填项仅适用于 `redis` 模式。

| 变量                                                                   | 类型                    | 默认值       | 说明                                                             |
| ---------------------------------------------------------------------- | ----------------------- | ------------ | ---------------------------------------------------------------- |
| `BOTTLENECK_MODE`                                                      | `'redis'` \| `'memory'` | `memory`     | 运行模式                                                         |
| `BOTTLENECK_REDIS_MODE`                                                | string                  | `single`     | 仅支持 `single`（单节点）/ `sentinel`（哨兵），仅 redis 模式使用 |
| `BOTTLENECK_REDIS_HOST`                                                | string                  | —（必填）    | Redis 主机（single 模式）                                        |
| `BOTTLENECK_REDIS_PORT`                                                | number                  | —（必填）    | Redis 端口（single 模式）                                        |
| `BOTTLENECK_REDIS_PASSWORD`                                            | string                  | —            | Redis 密码（可选）                                               |
| `BOTTLENECK_REDIS_DB`                                                  | number                  | —（必填）    | Redis 数据库编号（推荐 `3`，禁止与缓存/锁/队列共用）             |
| `BOTTLENECK_REDIS_SENTINEL_MASTER_NAME` / `BOTTLENECK_REDIS_SENTINELS` | string                  | —            | sentinel 模式必填                                                |
| `BOTTLENECK_REDIS_KEY_PREFIX`                                          | string                  | `bottleneck` | Redis key 前缀                                                   |

## 快速开始

### 1. 注册模块

```typescript
import { BottleneckModule } from '@/common/modules/bottleneck/bottleneck.module';

@Module({
  imports: [BottleneckModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

### 2. wrap — 包装函数自动限流

最常用的方式，将异步/同步函数包装在限流器中执行：

```typescript
import { BottleneckService } from '@/common/modules/bottleneck/bottleneck.service';

@Injectable()
export class ExternalApiService {
  constructor(private readonly _bottleneckService: BottleneckService) {}

  async fetchData(): Promise<ApiResponse> {
    return await this._bottleneckService.wrap(
      'external-api',
      async () => await this.httpClient.get('/data'),
      { maxConcurrent: 10, minTime: 100 },
    );
  }
}
```

### 3. schedule — 调度任务

与 `wrap` 类似，但直接使用 `limiter.schedule()` 执行。当前服务两者的 `options` 都是限流器配置，不是单任务优先级或权重选项：

```typescript
const result = await this._bottleneckService.schedule(
  'rpc-calls',
  async () => await this.rpcClient.call('method'),
  { maxConcurrent: 5, minTime: 200 },
);
```

### 4. createLimiter — 直接操作限流器

需要复用实例或调用本地接口暴露的方法时使用；返回类型是 [IBottleneckLimiter](../../src/common/modules/bottleneck/interfaces/bottleneck-client.interface.ts)，不代表暴露上游库的全部 API：

```typescript
const limiter = this._bottleneckService.createLimiter('custom', {
  maxConcurrent: 3,
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60_000,
});

// Redis 模式直接操作实例时先等待就绪；service.wrap/schedule 已代为处理
await limiter.ready();
const wrappedFn = limiter.wrap(async () => myFunction(arg1, arg2));
await wrappedFn();
```

### 5. 查询限流状态

```typescript
// 当前排队 + 执行中的任务数
const taskCount = this._bottleneckService.count('external-api');

// 当前令牌桶剩余令牌
const remaining =
  await this._bottleneckService.currentReservoir('external-api');
```

## API 一览

| 方法                             | 说明                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| `createLimiter(key, options?)`   | 创建或获取限流器（同 key 复用）                                            |
| `wrap<T>(key, fn, options?)`     | 包装函数，自动限流执行                                                     |
| `schedule<T>(key, fn, options?)` | 调度任务执行                                                               |
| `count(key)`                     | 获取当前实例排队、等待开始和执行中的任务数（QUEUED + RUNNING + EXECUTING） |
| `currentReservoir(key)`          | 获取剩余令牌数                                                             |

## 常用 Bottleneck 配置项

| 参数                       | 类型   | 说明                                     |
| -------------------------- | ------ | ---------------------------------------- |
| `maxConcurrent`            | number | 最大并发数（null = 无限）                |
| `minTime`                  | number | 两次执行的最小间隔（毫秒）               |
| `highWater`                | number | 本地队列高水位，超过时按 `strategy` 处理 |
| `reservoir`                | number | 令牌桶初始令牌数                         |
| `reservoirRefreshInterval` | number | 令牌刷新间隔（毫秒）                     |
| `reservoirRefreshAmount`   | number | 每次刷新时将令牌数重置为此值             |
| `strategy`                 | number | 溢出策略（Bottleneck.strategy.\*）       |

> 完整参数参见 [bottleneck 官方文档](https://github.com/SGrondin/bottleneck#constructor)

## 架构设计

```
src/common/modules/bottleneck/
├── bottleneck.module.ts                    # 模块定义，forRoot 注册
├── bottleneck.service.ts                   # 限流服务核心
└── interfaces/
    ├── bottleneck-client.interface.ts      # 限流客户端接口
    └── bottleneck-config.interface.ts      # 模块配置接口

src/configs/
└── bottleneck.config.ts                    # 环境变量配置
```

## 内存模式 vs Redis 模式

| 特性     | 内存模式        | Redis 模式     |
| -------- | --------------- | -------------- |
| 部署     | 单实例          | 多实例分布式   |
| 状态共享 | 进程内          | Redis 跨实例   |
| 依赖     | 无              | Redis          |
| 适用场景 | 开发 / 单机服务 | 生产多实例部署 |

## 注意事项

- `wrap` 和 `schedule` 的 `options` 参数仅在首次创建限流器时生效，后续调用同 key 会复用已有实例
- Redis 模式下，`wrap`/`schedule`/`currentReservoir` 会等待 `ready()` 返回的 Promise；就绪失败会记录日志并向调用方抛出原始错误。
- `count()` 统计当前实例的 QUEUED、RUNNING、EXECUTING 状态，不包含尚未被接受的 RECEIVED 或已完成的 DONE，也不是跨实例总数。
- Redis 模式启动时等待命令与订阅两条连接就绪；首次连接错误立即使启动失败，始终未就绪则在 10 秒后失败，并释放两条连接。启动成功后的短暂断线仍交由 ioredis 重连。
- 所有限流器共享一个 `IORedisConnection`。销毁时先终止共享连接（它同时拥有命令与订阅连接），再清理限流器，避免尚未完成的取消订阅命令被断连而产生未处理异常；重复销毁不会重复关闭连接。
- 销毁沿用 `disconnect()` 的断开语义，不等待或取消已执行的业务函数，也不保证排队任务完成。需要处理完任务再停机的业务，应先停止接收任务并自行等待完成，再销毁服务。
- `_isInfoCommandError` 用于过滤 Redis 初始化阶段可能产生的 `INFO` 命令错误，降为 debug 级别
