# DistributedLockModule

基于 [Redlock](https://github.com/mike-marcacci/node-redlock) 算法的分布式锁模块，用于多实例部署下对共享资源的互斥访问（如任务处理、结算、对账等）。

## 功能特性

- **Redlock 算法**：基于 Redis 的分布式锁，支持多 Redis 实例的容错与法定人数决策
- **自动重试与续期**：加锁失败可重试，持锁期间支持自动续期，避免长任务超时
- **统一 API**：通过 `DistributedLockService.using()` 在锁保护下执行回调，自动加锁/解锁与异常处理
- **可配置**：调用时可自定义 TTL、重试次数、重试间隔、续期阈值及 `AbortSignal` 中断

## 重要说明：与数据库锁的关系

**分布式锁主要用于应用层协调、减少重复执行与竞争，从而提高整体性能与可预期性；它不能替代数据库的并发控制。**

- 需要**数据正确性**时（如余额扣减、库存扣减、唯一性约束），必须在数据库层做并发控制：
  - 使用**事务 + 行级锁**（如 `SELECT ... FOR UPDATE`）、**乐观锁**（版本号/条件更新）或**唯一约束**等，由数据库保证一致性。
- 本模块的分布式锁适合用来：
  - 避免多实例重复执行同一任务（如定时报表、对账任务）；
  - 在应用层串行化对同一资源的处理，降低冲突与重试；
  - 与数据库锁**配合使用**：先拿分布式锁再在事务内做带锁的读写，既减少无效竞争，又保证数据正确。

**结论：该用数据库锁的场景仍必须用数据库锁；分布式锁是应用层协调手段，不能替代数据库锁。**

## 依赖

| 包               | 用途           |
| ---------------- | -------------- |
| `redlock`        | Redlock 实现   |
| `ioredis`        | Redis 客户端   |
| `@nestjs/config` | 配置管理       |
| `nestjs-pino`    | 结构化日志     |

## 环境变量

Redis 连接相关环境变量（`REDIS_MODE` / `REDIS_HOST` / `REDIS_PORT` 等）由 [`RedisModule`](../redis/README.md) 维护。Redlock 行为参数在调用 `using()` 时通过 `options` 按需覆盖；本模块仅保留键前缀一项：

```env
# 可选（有默认值）
DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock
```

## 快速开始

### 1. 在 AppModule 中注册一次（全局）

模块类已使用 `@Global()` 标记，**无需** `forRoot`；在根模块 `imports` 中加入 `DistributedLockModule` 一次即可，其他业务模块可直接注入 `DistributedLockService`，不必再 `import` 本模块。

```typescript
import { DistributedLockModule } from '@/common/modules/distributed-lock/distributed-lock.module';

@Module({
  imports: [DistributedLockModule],
})
export class AppModule {}
```

### 2. 注入并使用

```typescript
import { DistributedLockService } from '@/common/modules/distributed-lock/distributed-lock.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderService {
  constructor(private readonly _lock: DistributedLockService) {}

  async processOrder(orderId: string) {
    return this._lock.using({
      resources: `order:${orderId}`,
      execute: async () => {
        // 在锁保护下执行，同一 orderId 同一时刻仅一个实例能进入
        return await this._doProcess(orderId);
      },
    });
  }
}
```

## API 说明

### `DistributedLockService.using<T>(params)`

在分布式锁保护下执行回调，自动加锁、执行、解锁；若自动续期失败会通过 `RedlockAbortSignal` 通知回调。

| 参数            | 类型                                                                 | 说明 |
| --------------- | -------------------------------------------------------------------- | ---- |
| `resources`     | `string \| string[]`                                                 | 资源键（不带前缀），单键或键数组，多键时需全部加锁才进入 |
| `execute`       | `(signal?: RedlockAbortSignal) => Promise<T> \| T`                   | 受锁保护的执行函数，可接收中止信号 |
| `ttlMs`         | `number`（可选）                                                     | 锁 TTL（毫秒），默认 30_000 |
| `options`       | `DistributedLockUsingOptions`（可选）                                | 重试/续期/漂移及 AbortSignal，见下表 |

**返回值**：`Promise<T>`，即 `execute` 的返回结果。

### `DistributedLockUsingOptions`

单次调用时可传入的 Redlock 行为与中止控制：

| 字段                         | 类型           | 说明 |
| ---------------------------- | -------------- | ---- |
| `driftFactor`                | `number`       | 时钟漂移系数 |
| `retryCount`                 | `number`       | 加锁失败时的重试次数 |
| `retryDelay`                 | `number`       | 重试间隔（毫秒） |
| `retryJitter`                | `number`       | 重试抖动（毫秒） |
| `automaticExtensionThreshold`| `number`       | 自动续期阈值（毫秒） |
| `signal`                     | `AbortSignal`  | 外部中止信号，用于主动取消 |

### `RedlockAbortSignal`

`execute(signal)` 中的 `signal` 类型为 `AbortSignal & { error?: Error }`。当自动续期失败时，`signal.aborted` 为 `true`，`signal.error` 会带上错误，此时应尽快结束逻辑并避免依赖锁的互斥性。

### 资源键（resources）命名规范

为保证项目内锁键一致、可读且不冲突，建议统一遵守以下规范（服务内部会再拼接配置中的 `keyPrefix`，故此处仅定义「业务资源键」）。

**格式：**

```
<领域>:<资源>[:<动作>]:<标识>
```

- **领域**：业务域或模块，如订单、库存、账户、定时任务、结算、活动等。
- **资源**：被锁的实体或维度，如订单、SKU、账户、报表、商户、活动等。
- **动作**（可选）：同一资源下的不同操作，如支付、领取、报表生成等，用于区分不同互斥范围。
- **标识**：唯一标识，如 ID、日期、`userId:campaignId` 等，多段可用 `:` 连接。

**书写规则：**

| 规则         | 说明 |
| ------------ | ----- |
| 仅小写与数字 | 键中只使用小写字母、数字和冒号 `:`，禁止空格、下划线等 |
| 冒号分层     | 仅用 `:` 分隔层级，不要用 `-`、`_` 做层级 |
| 一域一前缀   | 同一业务域使用同一「领域:资源」前缀，避免不同业务键名冲突 |
| 语义清晰     | 见名知意，便于排查问题和做 Redis 键统计 |

**推荐前缀一览（按领域）：**

| 领域       | 推荐前缀示例        | 示例键 |
| ---------- | ------------------- | ------ |
| 订单       | `order`             | `order:123`, `order:pay:123` |
| 库存       | `inventory`         | `inventory:sku-001` |
| 账户/资金  | `account`           | `account:user-1`, 多键 `account:1`, `account:2` |
| 定时任务   | `cron`              | `cron:daily-report:2025-01-15` |
| 结算/对账  | `settlement`        | `settlement:merchant-1:2025-01-15` |
| 活动/营销  | `campaign`          | `campaign:claim:act-1:user-1` |

**应用内统一定义（推荐）：**

资源键与业务强相关，属于应用层约定，建议在**应用内**（如 `src/app/constants/lock-resource.ts` 或各业务模块）按上述格式自建常量，避免硬编码与冲突。例如：

```typescript
// 应用内示例：src/app/constants/lock-resource.ts（按业务需要定义）
export const LockResource = {
  order: (orderId: string) => `order:${orderId}`,
  orderPay: (orderId: string) => `order:pay:${orderId}`,
  inventory: (skuId: string) => `inventory:${skuId}`,
  account: (accountId: string) => `account:${accountId}`,
  cron: (taskName: string, id: string) => `cron:${taskName}:${id}`,
  settlement: (merchantId: string, date: string) => `settlement:${merchantId}:${date}`,
  campaignClaim: (campaignId: string, userId: string) => `campaign:claim:${campaignId}:${userId}`,
} as const;
```

使用时：

```typescript
resources: LockResource.orderPay(orderId)
// 多键
resources: [LockResource.account(fromId), LockResource.account(toId)]
```

## 使用示例

### 单资源、默认 TTL

```typescript
await this._lock.using({
  resources: 'task:sync-user',
  execute: async () => {
    await this._syncUser();
  },
});
```

### 多资源（多键原子加锁）

```typescript
await this._lock.using({
  resources: [`account:${fromId}`, `account:${toId}`],
  execute: async () => {
    await this._transfer(fromId, toId, amount);
  },
});
```

### 自定义 TTL 与重试

```typescript
await this._lock.using({
  resources: 'job:heavy-export',
  ttlMs: 60_000,
  options: {
    retryCount: 5,
    retryDelay: 500,
    retryJitter: 200,
  },
  execute: async () => {
    return await this._export();
  },
});
```

### 使用 AbortSignal 与处理续期失败

```typescript
const ac = new AbortController();

await this._lock.using({
  resources: 'long-running',
  ttlMs: 10_000,
  options: { signal: ac.signal },
  execute: async (signal) => {
    for (const item of items) {
      if (signal?.aborted) {
        throw signal.error ?? new Error('锁续期失败，已中止');
      }
      await this._processItem(item);
    }
  },
});

// 需要时主动取消
// ac.abort();
```

## 真实场景示例

### 场景一：防止重复下单 / 幂等提交

同一订单在支付回调、重试或重复点击时，只允许一个请求执行「更新订单状态 + 发券」等关键逻辑。

```typescript
@Injectable()
export class OrderPaymentService {
  constructor(private readonly _lock: DistributedLockService) {}

  async onPaymentNotify(orderId: string, paidAt: Date) {
    return this._lock.using({
      resources: `order:pay:${orderId}`,
      ttlMs: 15_000,
      options: { retryCount: 3 },
      execute: async () => {
        const order = await this._orderRepo.findByOrderId(orderId);
        if (order.status === 'paid') return { duplicated: true };
        await this._orderRepo.updateStatus(orderId, 'paid', paidAt);
        await this._couponService.grantForOrder(orderId);
        return { duplicated: false };
      },
    });
  }
}
```

### 场景二：定时任务多实例互斥

多台机器部署时，希望「每日报表生成」「全量同步」等任务在同一时刻只在一台实例上执行。

```typescript
@Injectable()
export class ReportSchedulerService {
  constructor(private readonly _lock: DistributedLockService) {}

  async runDailyReport(date: string) {
    return this._lock.using({
      resources: `cron:daily-report:${date}`,
      ttlMs: 60 * 60 * 1000, // 1 小时
      options: { retryCount: 0 }, // 抢不到就跳过，不重试
      execute: async () => {
        const report = await this._buildReport(date);
        await this._saveAndNotify(report);
        return report;
      },
    });
  }
}
```

### 场景三：库存扣减 / 秒杀防超卖

对同一 SKU 加锁，在锁内读库存、校验、扣减，避免并发下超卖。

```typescript
@Injectable()
export class InventoryService {
  constructor(
    private readonly _lock: DistributedLockService,
    private readonly _inventoryRepo: InventoryRepository,
  ) {}

  async deduct(skuId: string, quantity: number) {
    return this._lock.using({
      resources: `inventory:${skuId}`,
      ttlMs: 10_000,
      execute: async () => {
        const stock = await this._inventoryRepo.getStock(skuId);
        if (stock < quantity) {
          throw new BadRequestException('库存不足');
        }
        await this._inventoryRepo.deduct(skuId, quantity);
        return { remaining: stock - quantity };
      },
    });
  }
}
```

### 场景四：转账 / 账户余额变更（多资源）

对转出、转入账户同时加锁，保证同一笔转账的读写互斥，避免死锁时按固定顺序锁（如先小 ID 后大 ID）。

```typescript
@Injectable()
export class AccountTransferService {
  constructor(private readonly _lock: DistributedLockService) {}

  async transfer(fromAccountId: string, toAccountId: string, amount: number) {
    const resources = [fromAccountId, toAccountId].sort();
    return this._lock.using({
      resources: resources.map((id) => `account:${id}`),
      ttlMs: 20_000,
      execute: async () => {
        const from = await this._accountRepo.findById(fromAccountId);
        const to = await this._accountRepo.findById(toAccountId);
        if (from.balance < amount) throw new BadRequestException('余额不足');
        await this._accountRepo.updateBalance(fromAccountId, -amount);
        await this._accountRepo.updateBalance(toAccountId, amount);
        await this._recordTransfer(fromAccountId, toAccountId, amount);
        return { success: true };
      },
    });
  }
}
```

### 场景五：商户对账 / 结算任务（按维度加锁）

按「商户 ID + 结算日期」加锁，避免同一商户同一天被多个实例重复结算。

```typescript
@Injectable()
export class SettlementService {
  constructor(private readonly _lock: DistributedLockService) {}

  async settleForMerchant(merchantId: string, settleDate: string) {
    return this._lock.using({
      resources: `settlement:${merchantId}:${settleDate}`,
      ttlMs: 5 * 60 * 1000, // 5 分钟
      options: { retryCount: 2, retryDelay: 1000 },
      execute: async () => {
        const summary = await this._aggregateOrders(merchantId, settleDate);
        const already = await this._settlementRepo.findByMerchantAndDate(merchantId, settleDate);
        if (already) return { skipped: true, reason: '已结算' };
        await this._settlementRepo.create(merchantId, settleDate, summary);
        await this._payOut(merchantId, summary.amount);
        return { skipped: false };
      },
    });
  }
}
```

### 场景六：限流 / 单用户串行化

对同一用户 ID 加锁，使该用户的多次请求在关键步骤上串行执行（例如「领取活动奖励」每人同时只能处理一次）。

```typescript
@Injectable()
export class CampaignClaimService {
  constructor(private readonly _lock: DistributedLockService) {}

  async claimReward(userId: string, campaignId: string) {
    return this._lock.using({
      resources: `campaign:claim:${campaignId}:${userId}`,
      ttlMs: 8_000,
      execute: async () => {
        const claimed = await this._claimRepo.hasClaimed(userId, campaignId);
        if (claimed) throw new ConflictException('已领取过');
        await this._claimRepo.recordClaim(userId, campaignId);
        await this._rewardService.grant(userId, campaignId);
        return { ok: true };
      },
    });
  }
}
```

## 类型导出

模块导出以下类型，便于业务代码使用：

- `RedlockAbortSignal`：回调中的中止信号类型
- `DistributedLockUsingOptions`：`using()` 的 `options` 类型

## 参考

- [Redlock 算法](https://redis.io/docs/manual/patterns/distributed-locks/)
- [node-redlock](https://github.com/mike-marcacci/node-redlock)
- 模块内类型声明：`types/redlock.d.ts`
