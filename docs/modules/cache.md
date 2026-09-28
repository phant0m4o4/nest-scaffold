# CacheModule

[源码](../../src/common/modules/cache/) · [配置](../../src/configs/cache.config.ts) · [基础设施选型](../development/infra-modules.md)

提供类型安全缓存读写服务的模块。缓存持有**独立的 Redis 连接与独立 DB**：连接配置完全自带（`CACHE_REDIS_*` 命名空间；单机模式要求 `HOST`/`PORT`，两种模式均要求 `DB`，缺失直接启动报错并指明变量名，见 [.env.example](../../.env.example)）。

> ⚠️ 缓存可随时清空/被淘汰，**禁止与锁、队列等不可丢数据的服务共用一个 DB**（`FLUSHDB` 会清掉同 DB 的其他键，内存淘汰策略则作用于整个实例）。`.env.example` 的推荐分配为缓存 `CACHE_REDIS_DB=0`、锁 `DISTRIBUTED_LOCK_REDIS_DB=1`、队列 `QUEUE_REDIS_DB=2`。若使用不同的淘汰策略，再分开部署实例，详见 [DistributedLockModule](distributed-lock.md)「锁与缓存的 Redis 隔离」。

## 功能特性

- **JSON 序列化/反序列化** — `get<T>` / `set<T>` 自动处理，支持所有 JSON 可序列化类型
- **原始字符串操作** — `getRaw` / `setRaw` 直接读写不做序列化
- **TTL 管理** — 默认从配置读取，支持按调用覆盖；`-1` 表示永不过期
- **键前缀** — 所有键自动添加 `{keyPrefix}:` 前缀，避免多服务键冲突
- **批量操作** — `getBatch` / `setBatch` / `deleteBatch` / `existsBatch`
- **原子计数** — `increment` / `decrement` 支持自定义步长
- **Lua 脚本** — `executeScript` 支持自定义脚本执行
- **键管理** — `exists` / `getTTL` / `expire` / `persist` / `rename` / `flush`
- **健康检查** — `isHealthy()` 基于 `PING/PONG` 校验连接
- **独立连接与独立 DB** — 缓存专用连接（`CACHE_REDIS_DB`），与锁等不可丢数据的服务隔离

## 环境变量

> 缓存的连接配置完全自带（`CACHE_REDIS_*` 命名空间），必填项缺失直接启动报错，不会回退读取其他模块的配置。`.env` 中的 `REDIS_HOST` 等是纯锚点变量，仅供 `${REDIS_HOST}` 引用避免重复书写地址（见 `.env.example`）。

| 变量                                                         | 类型   | 默认值    | 说明                                 |
| ------------------------------------------------------------ | ------ | --------- | ------------------------------------ |
| `CACHE_TTL_SECONDS`                                          | number | `604800`  | 默认 TTL（秒），7 天                 |
| `CACHE_KEY_PREFIX`                                           | string | `cache`   | 键前缀                               |
| `CACHE_REDIS_MODE`                                           | string | `single`  | `single` / `sentinel`                |
| `CACHE_REDIS_HOST`                                           | string | —（必填） | Redis 主机（single 模式）            |
| `CACHE_REDIS_PORT`                                           | number | —（必填） | Redis 端口（single 模式）            |
| `CACHE_REDIS_PASSWORD`                                       | string | —         | 鉴权密码（可选）                     |
| `CACHE_REDIS_DB`                                             | number | —（必填） | 缓存专用 Redis DB，禁止与锁/队列共用 |
| `CACHE_REDIS_SENTINEL_MASTER_NAME` / `CACHE_REDIS_SENTINELS` | string | —         | sentinel 模式必填                    |

## 快速开始

### 1. 注册模块

模块已标记 `@Global()`，在 `AppModule` 中直接导入一次即可；无需 `forRoot`，其他模块直接注入 `CacheService`：

```typescript
import { CacheModule } from '@/common/modules/cache/cache.module';

@Module({
  imports: [CacheModule],
})
export class AppModule {}
```

### 2. 注入使用

```typescript
import { CacheService } from '@/common/modules/cache/cache.service';

@Injectable()
export class UserService {
  constructor(private readonly cacheService: CacheService) {}

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const cacheKey = `user:profile:${userId}`;
    // 优先从缓存读取
    const cached = await this.cacheService.get<UserProfile>(cacheKey);
    if (cached !== null) {
      return cached;
    }
    // 查数据库并写入缓存（TTL 300 秒）
    const profile = await this.userRepository.findOne(userId);
    if (profile) {
      await this.cacheService.set(cacheKey, profile, 300);
    }
    return profile;
  }
}
```

### 3. 批量操作

```typescript
// 批量读取
const results = await this.cacheService.getBatch<Product>([
  'prod:1',
  'prod:2',
  'prod:3',
]);
// results: [{ key, value, success }, ...]

// 批量写入（使用 Redis Pipeline，高性能）
const count = await this.cacheService.setBatch(
  [
    { key: 'prod:1', value: product1 },
    { key: 'prod:2', value: product2 },
  ],
  600,
);
```

### 4. 原子计数

```typescript
const newCount = await this.cacheService.increment('page:views', 1);
const remaining = await this.cacheService.decrement('quota:remaining', 5);
```

### 5. Lua 脚本

```typescript
const script = `
  local current = redis.call('GET', KEYS[1])
  if current and tonumber(current) > tonumber(ARGV[1]) then
    return redis.call('SET', KEYS[1], ARGV[1])
  end
  return nil
`;
await this.cacheService.executeScript(script, ['myKey'], [100]);
```

## API 一览

| 方法                                  | 说明                                               |
| ------------------------------------- | -------------------------------------------------- |
| `get<T>(key)`                         | 获取缓存值（JSON 反序列化）                        |
| `set<T>(key, value, ttl?)`            | 设置缓存值（JSON 序列化）                          |
| `getRaw(key)`                         | 获取原始字符串                                     |
| `setRaw(key, value, ttl?)`            | 设置原始字符串                                     |
| `getBatch<T>(keys)`                   | 批量获取（MGET）                                   |
| `setBatch<T>(items, ttl?)`            | 批量设置（pipeline，命令批量发送）                 |
| `delete(key)`                         | 删除单个键                                         |
| `deleteBatch(keys)`                   | 批量删除                                           |
| `exists(key)`                         | 检查键是否存在                                     |
| `existsBatch(keys)`                   | 批量检查存在性                                     |
| `getTTL(key)`                         | 获取剩余 TTL（秒；`-1` 无过期时间，`-2` 键不存在） |
| `expire(key, ttl)`                    | 设置过期时间                                       |
| `persist(key)`                        | 移除过期时间                                       |
| `rename(oldKey, newKey)`              | 重命名键                                           |
| `flush()`                             | 清空缓存专用 DB                                    |
| `increment(key, step?)`               | 原子递增                                           |
| `decrement(key, step?)`               | 原子递减                                           |
| `executeScript(script, keys?, args?)` | 执行 Lua 脚本                                      |
| `getConnectionStatus()`               | 获取连接状态                                       |
| `isHealthy()`                         | 健康检查                                           |

单机与哨兵模式使用相同的命令路径：读取用 `MGET`，写入用 pipeline（命令批量发送），
删除与存在性检查分别用多键 `DEL` / `EXISTS`。读取保留输入顺序；未命中或非字符串键
返回 `value: null, success: true`，JSON 解析失败则为 `success: false`。
批量写入先校验、序列化全部输入再发送命令，返回成功项数；pipeline 不保证整批原子性，
个别命令失败时其他项可能已写入。连接或整批命令失败会抛出错误。

## 架构设计

```
src/common/modules/cache/
├── cache.module.ts          # @Global 模块，在根模块直接导入
└── cache.service.ts         # 缓存服务（Redis 封装）

src/configs/
└── cache.config.ts          # 配置（TTL + 键前缀 + 自带 CACHE_REDIS_* 连接配置）
```

## 键名规则

- 键名必须是非空字符串
- 不能包含换行符（`\n` / `\r`）
- 加上前缀后总长度不超过 250 字符
- 完整键格式：`{keyPrefix}:{key}`

## 注意事项

- `setBatch` 使用 Redis Pipeline 一次性提交所有写入，相比逐条写入性能更优
- `flush()` 会执行 `FLUSHDB`，清空**缓存专用 DB** 内的所有数据（不影响其他 DB）；禁止在业务逻辑中调用
- 写入 TTL 只接受正安全整数（秒）或 `-1`（永不过期）；`0`、其他负数、小数、非有限数和不安全整数会在发送写命令前拒绝。`expire` 只接受正安全整数，取消过期使用 `persist`
- 模块启动时会自动执行 `PING` 健康检查；响应不是 `PONG` 或连接失败时就地释放连接并阻止应用启动，正常销毁时也会关闭专用连接
