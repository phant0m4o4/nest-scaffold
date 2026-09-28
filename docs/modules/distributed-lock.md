# DistributedLockModule

[源码](../../src/common/modules/distributed-lock/) · [配置](../../src/configs/distributed-lock.config.ts) · [基础设施选型](../development/infra-modules.md)

基于 [Redlock](https://github.com/mike-marcacci/node-redlock) 算法的分布式锁模块，用于多实例部署下对共享资源的互斥访问（如任务处理、结算、对账等）。

## 功能特性

- **Redis 分布式锁**：使用 Redlock 库，连接单机或哨兵管理的 Redis 主节点
- **自动重试与续期**：加锁失败可重试，持锁期间支持自动续期，避免长任务超时
- **统一 API**：通过 `DistributedLockService.using()` 在锁保护下执行回调，自动加锁/解锁与异常处理
- **可配置**：调用时可自定义 TTL、重试次数、重试间隔和续期阈值

## 重要说明：与数据库锁的关系

**分布式锁主要用于应用层协调、减少重复执行与竞争，从而提高整体性能与可预期性；它不能替代数据库的并发控制。**

- 需要**数据正确性**时（如余额扣减、库存扣减、唯一性约束），必须在数据库层做并发控制：
  - 使用**事务 + 行级锁**（如 `SELECT ... FOR UPDATE`）、**乐观锁**（版本号/条件更新）或**唯一约束**等，由数据库保证一致性。
- 本模块的分布式锁适合用来：
  - 避免多实例重复执行同一任务（如定时报表、对账任务）；
  - 在应用层串行化对同一资源的处理，降低冲突与重试；
  - 与数据库锁**配合使用**：先拿分布式锁再在事务内做带锁的读写，既减少无效竞争，又保证数据正确。

**结论：该用数据库锁的场景仍必须用数据库锁；分布式锁是应用层协调手段，不能替代数据库锁。**

本模块仅向 Redlock 提供一个单机或哨兵客户端，不是多个独立 Redis 主节点的多数派锁。异步复制后的主从切换、进程长时间暂停等情况下仍可能出现重叠执行；`noeviction`、持久化和自动续期都不能把它变成数据库一致性保证。数据库处理方式见[数据库规范](../development/database.md)。

## 重要说明：锁与缓存的 Redis 隔离（部署要求）

**锁数据绝不能与缓存共用同一个 Redis DB——至少 DB 编号要分开，生产环境建议直接分实例。**

原因：

- 缓存场景通常配置 `maxmemory-policy allkeys-lru` 等淘汰策略，内存吃紧时 Redis 会**静默淘汰任意键**——锁键一旦被淘汰，互斥性立即失效，两个实例可以同时持有"同一把锁"。
- 缓存的运维操作（如 `FLUSHDB` 清缓存）会连带清掉同 DB 内的锁键。
- 存放锁的 Redis 必须使用 `maxmemory-policy noeviction` 并开启持久化（至少 AOF `everysec`）。淘汰策略作用于整个实例，不会被 DB 编号隔离；缓存若需要自动淘汰，应单独部署实例。

脚手架**每个模块各自持有独立的 Redis 连接与独立 DB**：缓存为 `CACHE_REDIS_DB`、锁为 `DISTRIBUTED_LOCK_REDIS_DB`、队列为 `QUEUE_REDIS_DB`（均**必填**，缺失直接启动报错；`.env.example` 推荐分配缓存 `0` / 锁 `1` / 队列 `2`）。部署时仍需注意：

- **single / sentinel 模式**：缓存与锁使用不同 DB；锁所在 DB 不要再放其他可随时清空的数据；
- 存放锁的实例应配置 `maxmemory-policy noeviction` 并开启持久化（至少 AOF `everysec`）。

## 依赖

| 包               | 用途         |
| ---------------- | ------------ |
| `redlock`        | Redlock 实现 |
| `ioredis`        | Redis 客户端 |
| `@nestjs/config` | 配置管理     |
| `nestjs-pino`    | 结构化日志   |

## 环境变量

锁的连接配置完全自带（`DISTRIBUTED_LOCK_REDIS_*` 命名空间），必填项缺失直接启动报错，不会回退读取其他模块的配置；`.env` 中的 `REDIS_HOST` 等是纯锚点变量，仅供 `${...}` 引用避免重复书写地址。完整模板见 [.env.example](../../.env.example)。Redlock 行为参数在调用 `using()` 时通过 `options` 按需覆盖：

```env
DISTRIBUTED_LOCK_KEY_PREFIX=distributed-lock   # 可选，默认 distributed-lock
DISTRIBUTED_LOCK_REDIS_MODE=single            # 可选，默认 single
DISTRIBUTED_LOCK_REDIS_HOST=${REDIS_HOST}      # 必填
DISTRIBUTED_LOCK_REDIS_PORT=${REDIS_PORT}      # 必填
DISTRIBUTED_LOCK_REDIS_PASSWORD=${REDIS_PASSWORD}
DISTRIBUTED_LOCK_REDIS_DB=1                    # 必填
# 哨兵模式：无需 HOST / PORT，DB 仍必填
# DISTRIBUTED_LOCK_REDIS_MODE=sentinel
# DISTRIBUTED_LOCK_REDIS_SENTINEL_MASTER_NAME=${REDIS_SENTINEL_MASTER_NAME}
# DISTRIBUTED_LOCK_REDIS_SENTINELS=${REDIS_SENTINELS}
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
        // 正常持锁期间协调同一 orderId 的处理；业务方法仍须保证数据库正确性
        return await this._doProcess(orderId);
      },
    });
  }
}
```

## API 说明

### `DistributedLockService.using<T>(params)`

在分布式锁保护下执行回调，自动加锁、执行、解锁；若自动续期失败会通过 `RedlockAbortSignal` 通知回调。

| 参数        | 类型                                               | 说明                                                     |
| ----------- | -------------------------------------------------- | -------------------------------------------------------- |
| `resources` | `string \| string[]`                               | 资源键（不带前缀），单键或键数组，多键时需全部加锁才进入 |
| `execute`   | `(signal?: RedlockAbortSignal) => Promise<T> \| T` | 受锁保护的执行函数，可接收中止信号                       |
| `ttlMs`     | `number`（可选）                                   | 锁 TTL（毫秒），默认 30_000                              |
| `options`   | `DistributedLockUsingOptions`（可选）              | 重试/续期/漂移设置，见下表                               |

**返回值**：`Promise<T>`，即 `execute` 的返回结果。

### `DistributedLockUsingOptions`

单次调用时可传入的 Redlock 行为设置：

| 字段                          | 类型     | 说明                             |
| ----------------------------- | -------- | -------------------------------- |
| `driftFactor`                 | `number` | 时钟漂移系数，默认 `0.01`        |
| `retryCount`                  | `number` | 加锁失败时的重试次数，默认 `10`  |
| `retryDelay`                  | `number` | 重试间隔（毫秒），默认 `200`     |
| `retryJitter`                 | `number` | 重试抖动（毫秒），默认 `200`     |
| `automaticExtensionThreshold` | `number` | 自动续期阈值（毫秒），默认 `500` |

`ttlMs` 应为正整数，且至少比 `automaticExtensionThreshold` 大 `100` 毫秒。资源数组不能为空，重复资源会去重后传给 Redlock。

### `RedlockAbortSignal`

`execute(signal)` 中的 `signal` 类型为 `AbortSignal & { error?: Error }`。当自动续期无法在锁失效前恢复时，`signal.aborted` 为 `true`，`signal.error` 会带上错误，此时应尽快结束逻辑并避免依赖锁的互斥性。该信号不会自动终止回调或回滚已完成的业务操作，长任务需主动检查。

加锁、续期或释放失败可能使 `using()` 抛错；特别是释放失败时，业务操作可能已完成，重试前应按业务幂等记录判断，不能简单重放整个流程。

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

| 规则         | 说明                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| 固定部分小写 | 领域、资源和动作使用小写名称；标识可保留业务 ID、日期中的连字符，避免空白字符 |
| 冒号分层     | 用 `:` 分隔层级，`-` 可用于层级内名称或标识，如 `daily-report`、`sku-001`     |
| 一域一前缀   | 同一业务域使用同一「领域:资源」前缀，避免不同业务键名冲突                     |
| 语义清晰     | 见名知意，便于排查问题和做 Redis 键统计                                       |

**推荐前缀一览（按领域）：**

| 领域      | 推荐前缀示例 | 示例键                             |
| --------- | ------------ | ---------------------------------- |
| 订单      | `order`      | `order:123`, `order:pay:123`       |
| 库存      | `inventory`  | `inventory:sku-001`                |
| 账户/资金 | `account`    | `account:user-1`、`account:user-2` |
| 定时任务  | `cron`       | `cron:daily-report:2025-01-15`     |
| 结算/对账 | `settlement` | `settlement:merchant-1:2025-01-15` |
| 活动/营销 | `campaign`   | `campaign:claim:act-1:user-1`      |

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
  settlement: (merchantId: string, date: string) =>
    `settlement:${merchantId}:${date}`,
  campaignClaim: (campaignId: string, userId: string) =>
    `campaign:claim:${campaignId}:${userId}`,
} as const;
```

使用时：

```typescript
resources: LockResource.orderPay(orderId);
// 多资源锁按被保护的账户标识构建键
resources: [LockResource.account(fromId), LockResource.account(toId)];
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

### 处理自动续期失败

```typescript
await this._lock.using({
  resources: 'long-running',
  ttlMs: 10_000,
  execute: async (signal) => {
    for (const item of items) {
      if (signal?.aborted) {
        throw signal.error ?? new Error('锁续期失败，已中止');
      }
      await this._processItem(item);
    }
  },
});
```

## 真实场景示例

以下保留不同业务的锁键、TTL 和调用方式。示例中的业务方法、Repository 和依赖注入按应用补齐，不是脚手架内置 API；它们必须按注释实现数据库原子性、唯一约束与外部操作幂等，不能只依赖本模块防重。

### 场景一：防止重复下单 / 幂等提交

对同一订单的支付回调、重试或重复点击减少并发竞争；数据库中记录支付状态与发券进度，保证重试不会重复发券。

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
        // 应用业务方法：事务/条件更新确认支付，发券以订单号幂等且可重试
        return await this._processPaymentOnce(orderId, paidAt);
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
      options: { retryCount: 0 }, // 只尝试一次；失败会抛错，由调度层决定是否跳过
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

对同一 SKU 加锁以减少竞争；库存不足时拒绝扣减的保证必须来自数据库条件更新或事务行锁。

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
        // Repository 内先校验 quantity，再使用库存 >= quantity 的原子条件更新
        // 根据受影响行数判断库存不足，不使用“先查后改”代替数据库并发控制
        return await this._inventoryRepo.deductIfSufficient(skuId, quantity);
      },
    });
  }
}
```

### 场景四：转账 / 账户余额变更（多资源）

对转出、转入账户同时加锁以减少竞争。两边余额变更和流水必须在同一数据库事务内完成，事务中的行锁按固定顺序获取；业务请求还需有唯一流水号。这里的多资源 Redis 加锁是同次原子操作，排序不能替代数据库事务。

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
        // 应用业务方法：校验账户/金额，用唯一流水号防重，在同一事务内锁行并记账
        return await this._transferInTransaction(
          fromAccountId,
          toAccountId,
          amount,
        );
      },
    });
  }
}
```

### 场景五：商户对账 / 结算任务（按维度加锁）

按「商户 ID + 结算日期」加锁以减少重复结算竞争；该维度还须有数据库唯一约束，付款使用稳定的结算单号作为幂等键并支持失败恢复。

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
        // 应用业务方法：唯一约束创建/读取结算单，按付款状态幂等执行并恢复失败任务
        return await this._settleOnce(merchantId, settleDate);
      },
    });
  }
}
```

### 场景六：单用户串行化

对同一用户与活动加锁，减少领取奖励时的竞争；数据库以用户与活动的组合唯一约束防重。互斥不等于单位时间内的限流，需要调用频率控制时使用 [BottleneckModule](bottleneck.md)。

```typescript
@Injectable()
export class CampaignClaimService {
  constructor(private readonly _lock: DistributedLockService) {}

  async claimReward(userId: string, campaignId: string) {
    return this._lock.using({
      resources: `campaign:claim:${campaignId}:${userId}`,
      ttlMs: 8_000,
      execute: async () => {
        // 应用业务方法：唯一约束防重复领取，奖励发放以领取记录 ID 幂等且可恢复
        return await this._claimRewardOnce(userId, campaignId);
      },
    });
  }
}
```

## 类型导出

模块导出以下类型，便于业务代码使用：

- `RedlockAbortSignal`：回调中的中止信号类型
- `DistributedLockUsingOptions`：`using()` 的 `options` 类型

## 生命周期

- 启动时建立模块专用连接并执行 `PING`；响应不是 `PONG` 或连接失败时就地关闭连接并阻止启动。
- 锁竞争以 debug 级别记录，连接等异常以 error 级别记录；调用方仍需处理 `using()` 的失败结果。
- 模块销毁时关闭专用 Redis 连接。服务不负责等待所有业务回调结束，停机时应先停止接收新工作并等待当前任务完成。

## 参考

- [Redlock 算法](https://redis.io/docs/manual/patterns/distributed-locks/)
- [node-redlock](https://github.com/mike-marcacci/node-redlock)
- [模块内类型声明](../../src/common/modules/distributed-lock/types/redlock.d.ts)
