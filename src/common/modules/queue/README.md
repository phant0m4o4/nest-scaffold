# QueueModule

基于 [BullMQ](https://docs.bullmq.io/) 的队列模块，封装了队列注册、Redis 连接管理、并发控制以及开发环境下的 [Bull Board](https://github.com/felixmosh/bull-board) 仪表盘自动集成。

## 功能特性

- **统一队列注册入口**：通过 `registerQueue` / `registerQueueAsync` 注册业务队列
- **Redis 连接管理**：根据配置自动建立 BullMQ 与 Redis 的连接
- **全局并发控制**：通过 `globalConcurrency` 选项限制跨所有 Worker 进程的并发数
- **单 Worker 并发控制**：通过 `@Processor({ concurrency })` 限制单进程内并发数
- **Bull Board 自动集成**：开发环境下自动启用仪表盘，队列自动注册到仪表盘
- **环境隔离**：生产/测试环境不加载 Bull Board，零额外开销

## 依赖

| 包名                  | 说明                                         |
| --------------------- | -------------------------------------------- |
| `@nestjs/bullmq`      | NestJS BullMQ 集成                           |
| `bullmq`              | BullMQ 核心库                                |
| `ioredis`             | Redis 客户端                                 |
| `@bull-board/api`     | Bull Board API（devDependencies）            |
| `@bull-board/express` | Bull Board Express 适配器（devDependencies） |
| `@bull-board/nestjs`  | Bull Board NestJS 集成（devDependencies）    |

## 环境变量

在 `.env` 中配置以下变量（均为可选，有默认值）：

| 变量名                  | 说明                  | 默认值      |
| ----------------------- | --------------------- | ----------- |
| `QUEUE_REDIS_HOST`      | Redis 主机地址        | `127.0.0.1` |
| `QUEUE_REDIS_PORT`      | Redis 端口            | `6379`      |
| `QUEUE_REDIS_PASSWORD`  | Redis 密码            | 无          |
| `QUEUE_REDIS_DB`        | Redis 数据库编号      | `0`         |
| `QUEUE_REDIS_PREFIX`    | 队列 key 前缀         | `queue`     |
| `QUEUE_DASHBOARD_ROUTE` | Bull Board 仪表盘路由 | `/queues`   |

## 使用方式

### 1. 在 AppModule 中导入

```typescript
import { QueueModule } from '@/common/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
})
export class AppModule {}
```

### 2. 在业务模块中注册队列

**同步注册：**

```typescript
@Module({
  imports: [QueueModule.registerQueue({ name: 'email' })],
})
export class EmailModule {}
```

**异步注册：**

```typescript
@Module({
  imports: [
    QueueModule.registerQueueAsync({
      name: 'notification',
      useFactory: () => ({
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      }),
    }),
  ],
})
export class NotificationModule {}
```

### 3. 注入队列并使用

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export class EmailService {
  constructor(@InjectQueue('email') private readonly _emailQueue: Queue) {}

  async sendWelcomeEmail(userId: string): Promise<void> {
    await this._emailQueue.add('welcome', { userId });
  }
}
```

### 4. 创建队列处理器

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  async process(job: Job<{ userId: string }>): Promise<void> {
    // 处理任务逻辑
  }
}
```

## 并发控制

### 全局并发（跨所有进程）

通过 `globalConcurrency` 选项，在 Redis 层面限制整个队列同时最多被多少个 Worker 消费。
无论部署了多少个进程/实例，该队列同时执行的任务数不会超过此值。

```typescript
@Module({
  imports: [
    // 所有进程加起来，同一时间最多执行 1 个订单任务
    QueueModule.registerQueue({
      name: 'order',
      globalConcurrency: 1,
    }),
  ],
})
export class OrderModule {}
```

**原理**：模块初始化时自动调用 BullMQ 的 `Queue.setGlobalConcurrency()`，通过 Redis 原子操作控制全局并发。

### 单 Worker 并发（per-process）

通过 `@Processor` 装饰器的 `concurrency` 选项控制单个 Worker 实例的并发数。
如果启动了 N 个进程，实际最大并发 = N × concurrency。

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

// 当前进程的 Worker 同时最多处理 5 个任务
@Processor('email', { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    // ...
  }
}
```

### 两者组合

全局并发和单 Worker 并发可以同时使用，BullMQ 取两者的较小值：

```typescript
// 模块注册：全局最多 10 个并发
QueueModule.registerQueue({
  name: 'report',
  globalConcurrency: 10,
});

// 处理器：单进程最多 3 个并发
@Processor('report', { concurrency: 3 })
export class ReportProcessor extends WorkerHost { ... }

// 假设部署了 5 个进程：
// - 单 Worker 限制：5 × 3 = 15
// - 全局限制：10
// - 实际最大并发：min(15, 10) = 10
```

### 选择建议

| 场景                      | 方案         | 设置方式                         |
| ------------------------- | ------------ | -------------------------------- |
| 整个队列严格串行          | 全局并发 = 1 | `globalConcurrency: 1`           |
| 限制总并发（如 API 限速） | 全局并发 = N | `globalConcurrency: N`           |
| 限制单进程资源占用        | Worker 并发  | `@Processor({ concurrency: N })` |
| 两者兼顾                  | 组合使用     | 同时设置                         |

## 架构设计

```
QueueModule (@Module 装饰器)
├── BullModule.forRootAsync          ← Redis 连接配置（通过 ConfigService）
├── BullBoardModule.forRootAsync     ← 仪表盘根配置（仅开发环境）
│
├── registerQueue(options)           ← 同步注册队列
│   ├── BullModule.registerQueue     ← 队列 Provider
│   ├── ConcurrencyProvider          ← 全局并发初始化（如有 globalConcurrency）
│   └── BullBoardModule.forFeature   ← 仪表盘注册（仅开发环境）
│
└── registerQueueAsync(options)      ← 异步注册队列
    ├── BullModule.registerQueueAsync
    ├── ConcurrencyProvider          ← 全局并发初始化（如有 globalConcurrency）
    └── BullBoardModule.forFeature   ← 仪表盘注册（仅开发环境）
```

## Bull Board 仪表盘

开发环境（`NODE_ENV=development`）下：

- 根模块自动启用 Bull Board，路由默认为 `/queues`
- 通过 `registerQueue` / `registerQueueAsync` 注册的队列自动添加到仪表盘
- 访问 `http://localhost:3000/queues` 可查看队列状态、任务详情、重试失败任务等

生产/测试环境下 Bull Board 相关代码不会加载。
