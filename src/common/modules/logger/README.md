# LoggerModule

封装 [nestjs-pino](https://github.com/iamolegga/nestjs-pino)，提供统一的结构化日志能力，根据运行环境自动选择日志策略。

## 功能特性

- **环境自适应**：开发/测试环境使用 pino-pretty 彩色输出，生产环境输出结构化 JSON
- **文件落盘**：通过 pino-roll 按天+按大小滚动写文件，可选开启
- **敏感字段脱敏**：生产环境自动隐藏 Authorization、Cookie、密码等字段
- **请求 ID**：每个请求自动生成 UUID，通过 `X-Request-Id` 响应头回显
- **健康检查静默**：自动跳过 `/health` 路由的请求日志

## 环境策略

| 环境 | NODE_ENV | 日志级别 | 输出格式 | 脱敏 | 文件落盘 |
|------|----------|----------|----------|------|----------|
| 开发 | `development` | debug | pino-pretty 彩色 | 否 | 可选 |
| 测试 | `test` | debug | pino-pretty 彩色 | 否 | 否 |
| 生产 | `production` | info | 结构化 JSON | 是 | 可选 |

## 环境变量

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `LOG_FILE_ENABLE` | `'true'` / `'false'` | `'false'` | 是否启用文件落盘 |
| `LOG_FILE_PATH` | string | `${process.cwd()}/logs` | 日志文件目录 |

```env
# .env 示例
LOG_FILE_ENABLE=false
LOG_FILE_PATH=/var/log/my-app
```

## 使用方式

### 1. 注册模块

在 `AppModule` 中导入 `LoggerModule`：

```typescript
import { LoggerModule } from '@/common/modules/logger/logger.module';

@Module({
  imports: [
    LoggerModule.forRoot({ name: 'my-app' }),
  ],
})
export class AppModule {}
```

`name` 参数用于日志文件基名，最终文件路径为 `${LOG_FILE_PATH}/${name}.log`，默认为 `app`。

> **只需在 `AppModule` 导入一次**：nestjs-pino 的 `LoggerModule` 内部已标记 `@Global()`，因此只要在根模块导入一次 `LoggerModule.forRoot()`，所有子模块即可直接 `@InjectPinoLogger()` 使用，**不需要**在其他业务模块中再次导入 `LoggerModule`。

### 2. 在服务中注入

```typescript
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class UserService {
  constructor(
    @InjectPinoLogger(UserService.name)
    private readonly _logger: PinoLogger,
  ) {}

  async findOne(id: string): Promise<User> {
    this._logger.info({ userId: id, event: 'user_query' }, '查询用户');
    // ...
  }
}
```

### 3. 在 main.ts 中启用

```typescript
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();
  await app.listen(3000);
}
```

`bufferLogs: true` 确保启动阶段的日志也经过 Pino 处理。

## 日志规范

### 日志级别

| 级别 | 场景 |
|------|------|
| `debug` | 临时排障信息，生产环境不输出 |
| `info` | 正常业务事件，如认证失败（单次） |
| `warn` | 短时多次失败、风控命中、疑似配置错误 |
| `error` | 程序异常、依赖超时、5xx 错误 |
| `fatal` | 服务不可用 |

### 结构化字段

```typescript
this._logger.info(
  {
    event: 'order_created',       // 事件标识（英文枚举）
    userId: '123',                // 业务上下文
    durationMs: 45,               // 耗时
  },
  '订单创建成功',                    // msg 使用中文
);
```

- `msg`：中文一句话摘要
- `event`：英文枚举，保持稳定可检索
- 详细上下文放结构化字段，不要拼接到 `msg` 中

### 子 Logger

```typescript
const authLogger = this._logger.child({ module: 'auth', clientId });
authLogger.info({ event: 'auth_success' }, '认证成功');
```

## 文件落盘

启用 `LOG_FILE_ENABLE=true` 后，日志通过 pino-roll 写入文件：

- **轮转频率**：每天一个新文件
- **大小上限**：单文件 20MB，超过自动切分
- **保留策略**：最多保留 365 个文件
- **文件命名**：`{name}.{yyyy-MM-dd}.log`
- **目录创建**：自动创建不存在的目录

## 生产环境脱敏字段

以下字段在生产日志中自动替换为 `[Redacted]`：

- `req.headers.authorization`（Bearer Token）
- `req.headers.cookie`（Cookie）
- `res.headers["set-cookie"]`（Set-Cookie）
- `password`（密码）

## 请求 ID

每个 HTTP 请求自动生成 UUID v4 作为请求 ID：

- 通过 `X-Request-Id` 响应头回显给客户端
- 日志中自动包含 `req.id` 字段
- 便于前后端联调和跨系统日志关联

## 架构

```
LoggerModule.forRoot({ name })
  └── PinoLoggerModule.forRootAsync()
        ├── ConfigModule.forFeature(logConfig)  ← 读取 LOG_FILE_ENABLE / LOG_FILE_PATH
        └── useFactory()
              ├── development / test → _buildDevConfig()
              │     ├── pino-pretty（控制台）
              │     └── pino-roll（可选文件）
              └── production → _buildProdConfig()
                    ├── pino/file（stdout JSON）
                    ├── redact（脱敏）
                    └── pino-roll（可选文件）
```
