# 通用基础设施模块

所有模块均位于 `src/common/modules/`，且都用 `@Global()`，在 `AppModule` 注册一次即可全局注入。**业务模块不要再次 imports**。

详细 README 在每个模块目录下；本文给出"何时用、怎么用、避坑"的速查。

## RedisModule

**何时用**：业务直接需要 Redis 客户端（操作 Hash、List、Set、Sorted Set、Streams 等原生数据结构）。

```ts
constructor(private readonly _redisService: RedisService) {}
const client = this._redisService.getClient(); // Redis | Cluster
```

支持三种模式（`REDIS_MODE`）：`single` / `sentinel` / `cluster`。

**避坑**：

- 不要把这个 client 直接共享给 BullMQ。BullMQ Worker 需要 blocking subscribe 连接，框架已经在 `QueueModule` 里独立维护连接（`QUEUE_REDIS_*` 环境变量）。
- `Cluster` 与 `Redis` 部分命令行为不同，必要时 `instanceof Cluster` 收窄。

## CacheModule

**何时用**：JSON 缓存读写、TTL 管理、原子计数、Lua 脚本。

```ts
constructor(private readonly _cache: CacheService) {}
await this._cache.set('user:1', userObj, 300);
const u = await this._cache.get<UserProfile>('user:1');
await this._cache.increment('counter:visits', 1);
```

API 速查（更全见 `src/common/modules/cache/README.md`）：

- `get<T>(k)` / `set<T>(k, v, ttl?)` / `getRaw` / `setRaw`
- `getBatch` / `setBatch` / `deleteBatch` / `existsBatch`
- `exists` / `getTtl` / `expire` / `persist` / `rename`
- `increment` / `decrement` / `executeScript`
- `flush()` —— **整个 Redis FLUSHALL**，禁止业务里调用。
- `isHealthy()` —— 启动时已自动 PING 校验。

**键规则**：自动添加 `${CACHE_KEY_PREFIX}:` 前缀；不能含换行；带前缀总长 ≤ 250。

## DistributedLockModule

**何时用**：跨实例互斥（防重复任务、定时任务单实例、应用层串行化）。**不能替代数据库锁**：余额扣减、库存扣减必须配合事务 + 行锁/乐观锁/唯一约束。

```ts
constructor(private readonly _lock: DistributedLockService) {}

await this._lock.using({
  resources: `order:pay:${orderId}`,
  ttlMs: 15_000,
  options: { retryCount: 3, retryDelay: 500 },
  execute: async (signal) => {
    if (signal?.aborted) throw signal.error;
    // 锁内业务
  },
});
```

**资源键规范**：`<领域>:<资源>[:<动作>]:<标识>`，全部小写 + `:`。例如 `order:pay:123`、`account:1`、`cron:daily-report:2025-01-15`。建议在 `src/app/constants/lock-resource.ts` 集中常量。

**多键加锁**：`resources: [resourceA, resourceB]`，`Redlock` 会原子加锁；多账户转账记得按 ID 排序避免死锁。

## QueueModule（BullMQ）

**何时用**：异步任务、削峰、跨实例任务调度、需要重试/延迟/优先级。

注册队列（在业务模块内）：

```ts
@Module({
  imports: [
    QueueModule.registerQueue({
      name: 'email',
      globalConcurrency: 1,  // 全局并发上限
    }),
  ],
})
export class EmailModule {}
```

注入并入队：

```ts
@InjectQueue('email') private readonly _emailQueue: Queue;
await this._emailQueue.add('welcome', { userId });
```

处理器：

```ts
@Processor('email', { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  async process(job: Job<{ userId: string }>) { /* ... */ }
}
```

**并发**：`globalConcurrency` 跨实例上限（Redis 原子）；`@Processor({ concurrency })` 单进程上限。两者取较小值。

**Bull Board**：`NODE_ENV=development` 自动挂载到 `${QUEUE_DASHBOARD_ROUTE}`（默认 `/queues`）。

**避坑**：BullMQ 必须独立 Redis 连接；`QUEUE_REDIS_*` 默认引用 `${REDIS_*}`，需要走独立实例时改这里即可。Cluster 模式需自行扩展 `buildBullMqConnection`。

## LoggerModule（nestjs-pino）

注入：

```ts
@InjectPinoLogger(MyService.name) private readonly _logger: PinoLogger;

this._logger.info({ event: 'user_query', userId: '1' }, '查询用户');
```

**等级使用**：

| 等级 | 场景 |
|------|------|
| `trace` / `debug` | 临时排障，生产不输出 |
| `info` | 正常事件、业务预期失败（单次 401/403） |
| `warn` | 短时多次失败、风控命中、疑似配置错误（基于 IP/clientId 窗口可升级） |
| `error` | 程序异常、依赖超时、5xx |
| `fatal` | 服务不可用 |

**结构化字段**（lowerCamelCase）：

- 核心：`event`、`module`、`requestId`
- 业务：`userId`、`clientId`、`tenantId`
- 网络：`ip`、`userAgent`
- HTTP：`http.method`、`http.url`、`http.statusCode`、`durationMs`
- 诊断：`reason`、`failCount`、`rateLimited`、`retryable`
- 错误：`error`（Pino 自动展开 name/message/stack/cause）

**消息语言**：`msg` 中文一句话；`event`/`reason` 英文枚举。

**敏感字段**：生产自动 redact `req.headers.authorization`、`req.headers.cookie`、`res.headers["set-cookie"]`、`password`。

**子 logger**：`this._logger.logger.child({ module: 'auth', clientId })` 绑定上下文。

**采样**：高频 info 做 10% 采样；warn/error 全量。

## I18nModule

项目实际已不强依赖国际化（后端不做 i18n，字符串作为资源给前端）。如已存在，仅用于 `i18n/` 文件加载与 validation 错误格式化。

## BottleneckModule

**何时用**：进程内速率限流（如调第三方 API）。

详见 `src/common/modules/bottleneck/README.md`。

## DatabaseModule

见 `database.md`。

## 全局注入路径速查

```ts
import { CacheService } from '@/common/modules/cache/cache.service';
import { DistributedLockService } from '@/common/modules/distributed-lock/distributed-lock.service';
import { DatabaseService } from '@/common/modules/database/database.service';
import { RedisService } from '@/common/modules/redis/redis.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
```
