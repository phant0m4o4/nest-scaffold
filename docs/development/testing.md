# 测试

API 使用 Vitest + SWC，保留装饰器元数据；其测试入口也承载管理后台生产镜像的部署验证。共享契约和 API 客户端使用各包的单测配置。测试按验证边界分类，不按是否用了 Testcontainers 或 HTTP 请求来判断层级。前端界面与移动平台的验证范围见[前端开发](frontends.md#验证与发布)。

## 测试安全边界

本节适用于单元、集成、E2E、手动验证、调试脚本及 CI。要求“运行全部测试”“验证修复”或“完成 E2E”，不代表授权访问真实业务资源；安全边界优先于测试覆盖率与完成进度。

- **禁止写入生产数据**：不连接生产或共享开发数据库、Redis、队列、对象存储等进行测试；迁移、seed、清空、删除、发布消息等操作仅限本次测试创建的隔离资源。不能用“事务会回滚”或“之后删除”作为写入真实环境的理由。
- **禁止调用外部真实写入接口**：支付、下单、转账、发信、短信、Webhook、上传、删除和远程任务触发等均使用 mock 或本地模拟服务。是否写入按实际副作用判断，不按 GET / POST 等方法名判断；重试、后台 Worker、定时任务与失败清理同样受限。
- **禁止操作区块链主网**：不使用主网私钥或助记词，不签署或广播主网交易，不执行主网合约部署、调用、授权或资产转移。默认使用 mock 或本地开发链；本地 fork 也不能把交易转发到主网 RPC。
- **配置必须隔离**：不加载真实 `.env`、生产 Secrets、业务账号或钱包。测试显式注入临时连接信息和测试凭据；检查继承的环境变量、Docker context / `DOCKER_HOST`、代理和端口转发，不能仅凭 `localhost`、数据库名包含 `test` 或 `NODE_ENV=test` 判断安全。
- **不确定就停止**：地址、账号、网络或副作用无法确认时，不执行相关测试，说明缺少什么隔离条件；mock 漏配或目标不在测试允许范围时应失败，不自动回退到真实服务。不得为让测试通过而放开外部访问。
- **清理有边界**：只清理本次测试创建且能确认归属的容器、网络、数据和临时目录；不执行全局 prune、共享库清空、全量键删除或其他会影响既有资源的操作。

默认测试不包含第三方沙箱或公共测试网写入。只有用户另外明确要求这类联调时，才单独核对专用测试账号、接口地址、链 ID 和影响范围；这不解除生产环境与区块链主网禁令。读取外部资料或拉取依赖镜像不等于允许调用业务接口，真实数据的只读访问也不属于默认测试范围。

运行前先检查测试入口、配置来源、实际连接目标和清理逻辑。API 的公共 Vitest 配置设置 `NODE_ENV=test`，API 聚合入口、各测试项目及共享包测试配置通过 [`envDir: false`](https://vite.dev/config/shared-options.html#envdir) 禁止 Vite 自动加载本地 `.env*`；这不会阻止应用代码主动调用 dotenv / `ConfigModule.forRoot`，也不会清除进程继承的环境变量，**更不是网络隔离或出站请求拦截**。新增外部依赖时必须在对应测试边界显式 mock / 隔离并校验目标，不能假设测试框架已经提供安全沙箱。

## API 三层测试

| 层级     | 验证范围                                                                          | 位置与命名                                           |
| -------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 单元测试 | 隔离函数/类的行为，可 mock 依赖，不依赖真实数据库或 Redis                         | `apps/server/src/**/__tests__/*.unit-spec.ts`        |
| 集成测试 | 多个真实组件协作，例如仓储与数据库、服务与 Redis；可按边界替换配置或外部依赖      | `apps/server/src/**/__tests__/*.integration-spec.ts` |
| E2E      | 完整应用从公开边界验证，不替换内部 Provider、Pipe、Filter、Interceptor 或配置实现 | `apps/server/test/e2e/*.e2e-spec.ts`                 |

API 生产镜像 E2E 从镜像默认启动命令进入应用，验证完整 API 部署产物；管理后台镜像测试单独验证静态站点与代理边界，后端使用隔离替身。测试中仅用 `Test.createTestingModule` 装配部分模块并发 HTTP 请求，仍可能是集成测试，不自动成为 E2E。

## 配置与命令

| 配置                                                                             | 用途                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [vitest.config.mts](../../apps/server/vitest.config.mts)                         | 全量入口，通过 `test.projects` 聚合三层测试                  |
| [vitest-base.config.mts](../../apps/server/vitest-base.config.mts)               | 共享 SWC、别名与 `NODE_ENV=test`，不定义测试范围和覆盖率门槛 |
| [vitest-unit.config.mts](../../apps/server/vitest-unit.config.mts)               | 单测收集、覆盖率和防倒退门槛                                 |
| [vitest-integration.config.mts](../../apps/server/vitest-integration.config.mts) | 集成测试                                                     |
| [vitest-e2e.config.mts](../../apps/server/vitest-e2e.config.mts)                 | 端到端测试                                                   |
| [contracts/vitest.config.mts](../../packages/contracts/vitest.config.mts)        | 公开契约单测，收集 `src/**/*.test.ts`                        |
| [api-client/vitest.config.mts](../../packages/api-client/vitest.config.mts)      | 共享客户端单测，收集 `src/**/*.test.ts`                      |

```bash
pnpm test                     # API 三层、管理后台镜像测试 + 共享包单测，需要 Docker
pnpm test:unit                # API + 共享包单测
pnpm test:unit:watch          # API 单测监听，不包含共享包
pnpm test:shared              # 只运行两个共享包单测
pnpm test:unit:cov            # API 单测覆盖率检查 + 共享包单测
pnpm test:integration         # 集成测试，需要 Docker
pnpm test:e2e                 # API 与管理后台生产镜像 E2E，需要 Docker
```

根命令统一调度工作区。只测某个 API 文件时直接运行 API 包，文件路径相对 `apps/server`，例如 `pnpm --dir apps/server test:unit src/app/api/demo/__tests__/demo.service.unit-spec.ts`。API 专用配置共享基础配置，不互相继承或导入全量入口。共享包测试通过 `pnpm --dir packages/<包名> test` 单独运行，使用 mock fetch 等隔离依赖，不访问真实 API。

共享配置使用 SWC 保留装饰器元数据，并显式设置 `module.type: 'es6'`，覆盖生产构建 `.swcrc` 的 CommonJS 输出；不要为修复测试加载问题改动生产模块格式。

覆盖率门槛以 API 单测配置为准，报告输出到 `apps/server/coverage/`；根 `test:unit:cov` 会先跑共享包单测，但当前共享包没有覆盖率门槛。管理后台和手机端尚未配置组件测试或浏览器 / 原生交互自动化，不应把类型检查、bundle 构建或镜像测试当成这些测试已经通过。不能通过降低阈值、排除被测代码、跳过用例或减弱断言掩盖失败。覆盖率是防倒退信号，不代替关键业务断言。

CI 的具体检查见 [ci.yml](../../.github/workflows/ci.yml)：`ci` 运行工作区静态检查、类型检查、构建、单测覆盖率与 API 集成测试，`docker` 构建并复用 API 与管理后台镜像执行各自的生产镜像 E2E，不推送镜像。分支保护仍使用 `ci` / `docker` 两个检查名称。测试同样使用上述入口。本地 `pnpm test` 覆盖 API 三层测试、管理后台镜像测试与共享包单测，但不会自动运行 lint、类型检查、三端构建或单测覆盖率门槛；需要复现 CI 时分别运行对应命令。

## 单元测试

- 测试描述使用中文，按准备、执行、断言组织，重点验证结果和可观察副作用。
- 显式从 `vitest` 导入 `describe`、`it`、`expect`、`vi` 等，不依赖全局测试 API。
- Nest 服务可使用 `Test.createTestingModule` 与 `useMocker`，也可以显式注入 `useValue`；纯函数或依赖简单的类不必为形式创建整个 Nest 应用。
- 只 mock 当前测试边界以外的依赖；mock 应表现出场景需要的行为，避免一律返回空对象掩盖依赖遗漏。
- 成功/失败异步结果可直接用 `vi.fn().mockResolvedValue(...)` / `mockRejectedValue(...)`，不规定冗长的 Promise 包装风格。
- 服务配置通过配置 token 或 `ConfigService` mock 提供；测试配置解析本身时才隔离并恢复环境变量。

`vi.mock` 工厂会被提升，跨作用域状态用 `vi.hoisted()`；模拟可 `new` 的构造函数时不要使用箭头函数。实际写法见 [Redis 工厂单测](../../apps/server/src/common/utils/redis/__tests__/redis.factory.unit-spec.ts)。

共享状态需要串行时使用配置选项（如 `describe('名称', { concurrent: false }, ...)`），不要使用已弃用的 `describe.sequential`。能消除共享状态时优先隔离测试数据。

## 集成测试

通过 Testcontainers 启动临时依赖，并传入真实映射的地址、端口与独立测试配置。使用项目实际依赖提供的 `GenericContainer` 等 API，不复制不属于当前包的容器类示例。

- 数据库测试执行真实迁移，验证查询、约束、事务、分页和驱动错误映射。
- Redis 测试使用真实 Redis，验证协议、生命周期和模块协作，不能把所有命令都 mock 后仍称为 Redis 集成测试。
- 可用 `overrideProvider` 替换配置或不在本次集成边界内的第三方依赖；这与 E2E 的完整装配要求不同。
- `afterAll` 关闭应用/连接/容器，初始化中途失败也要清理已经创建的资源。
- 不读取开发者本地 `.env`，不操作开发/生产数据库。

新增 Storage 能力时，单测 mock 存储边界，协议集成使用测试专属的临时 S3 兼容服务，不调用真实云存储写入接口。不得用本地文件存储驱动替代业务实现来获得通过；除日志外无本地写入、上传中断、容量限制和存储故障时不回退本地，均按[文件写入约束](engineering-conventions.md#文件写入与-storage)验证。测试工具自身的临时目录不代表应用可以落盘。

模块生成器产出的集成测试在隔离准备完成前明确失败，且不导入完整应用。按现有隔离集成测试补齐临时依赖、配置和清理，再替换失败占位用例；不能跳过或删除断言来获得通过结果。

## 生产镜像 E2E

Docker 必须已启动，`docker` 命令需在 PATH 中。测试默认以仓库根为构建上下文，从 [API Dockerfile](../../apps/server/Dockerfile) 和[管理后台 Dockerfile](../../apps/admin-frontend/Dockerfile) 分别构建带随机标签的临时生产镜像，首次构建或拉取依赖镜像需要网络。应用通过镜像默认启动命令运行；API 容器以 `NODE_ENV=production` 运行。

测试不读取本地 `.env`、不挂载源码。API 测试使用独立网络中的临时 MySQL 9 和 Redis 8；管理后台测试使用另一个独立网络及临时内存 HTTP 后端替身，不连接真实业务 API。“生产镜像”指构建产物及运行模式，不是生产服务器或生产数据；Docker 独立网络也不等于禁止容器访问外网，新增第三方集成仍须遵守上述安全边界。运行 `pnpm test:e2e` 同时执行两个镜像的测试，或通过 `pnpm test` 的全量入口执行。

```bash
E2E_APP_IMAGE=<API本地镜像标签> E2E_ADMIN_IMAGE=<管理后台本地镜像标签> pnpm test:e2e
```

两个变量分别复用已有镜像，未设置的镜像由对应测试自动构建；调用方指定的镜像不会被删除。仅使用可信、已确认不内置真实凭据或外部写入行为的本项目镜像。测试使用临时容器和独立网络，结束时清理自己创建的资源；CI 构建并加载镜像后通过这两个变量复用。E2E 不允许空测试集悄悄通过。

[生产镜像测试](../../apps/server/test/e2e/production-image.e2e-spec.ts) 当前验证：

- 完整应用连接真实 MySQL 和 Redis，以非 root 用户运行；Argon2 原生依赖能够完成哈希与验证。
- 翻译和迁移资源齐全，本机配置、源码与测试目录未进入运行镜像。
- 数据库迁移连续执行两次，表结构与基础数据正确且不重复。
- HTTP 统一 404 响应，生产环境不暴露 Demo、管理端 Demo 和队列面板。
- CORS 白名单生效，错误的生产跨域配置或公开示例主密钥拒绝启动。
- 将真实 `SIGTERM` 发给容器主进程，验证连接释放、正常停机及退出码 0，而不是直接调用内部生命周期方法。

[管理后台镜像测试](../../apps/server/test/e2e/admin-image.e2e-spec.ts) 验证非 root 运行、SPA 深链接回退、首页与静态资源缓存策略、缺失资源返回 404，以及 `/api/` 前缀移除后路径和查询参数的转发。它验证 Nginx 镜像部署边界，不运行浏览器页面交互，也不代表完整前后端业务联调或手机真机测试。

位于 `apps/server/src/**` 的 Redis factory、Demo cursor 等测试仍归类为集成测试，不因依赖真实容器而改称 E2E。

## 如何选择覆盖范围

- 修复 bug：先补能暴露原问题的回归用例，再验证修复。
- 业务逻辑：正常、边界和失败路径按实际风险覆盖；涉及重试、幂等、取消、并发时补相应场景。
- 修改数据库/Redis 行为：补或运行相关集成测试，不能只凭 mock 推断真实依赖行为。
- 修改启动、全局管道、生产配置、容器或公开核心链路：运行对应 E2E。
- 文档与注释变更：核对内容、链接和命令即可，不要求为每个 Module 再造一套 E2E。

不机械要求每个公共方法、Controller 或 Module 都有同样数量的测试；优先保护行为契约与风险点。未验证部分明确说明，日常流程见 [workflows.md](workflows.md)。

## 可复用的真实示例

- [Demo 服务单测](../../apps/server/src/app/api/demo/__tests__/demo.service.unit-spec.ts)：筛选范围、排序与加密游标。
- [仓储游标单测](../../apps/server/src/common/modules/database/mysql/repositories/__tests__/base.repository.cursor.unit-spec.ts)：多列 keyset。
- [Demo 数据库集成测试](../../apps/server/src/app/api/demo/__tests__/demo-cursor.integration-spec.ts)：临时 MySQL 上的 CRUD、真实 DTO 管道校验、唯一 / 外键冲突、游标和页码分页；显式准备测试表结构，不加载本地配置。
- [PostgreSQL 集成测试](../../apps/server/src/common/modules/database/pgsql/__tests__/database.integration-spec.ts)：临时数据库上的空闲连接故障恢复。
- [Redis 工厂集成测试](../../apps/server/src/common/utils/redis/__tests__/redis-factory.integration-spec.ts)：真实连接与关闭。
- [缓存集成测试](../../apps/server/src/common/modules/cache/__tests__/cache.integration-spec.ts)：批量操作与输入校验。
- [队列集成测试](../../apps/server/src/common/modules/queue/__tests__/queue.integration-spec.ts)：任务执行、停机与持久化全局并发。

调试单测可在编辑器 JavaScript Debug Terminal 运行原命令；需要手动附加时使用 `pnpm --dir apps/server exec vitest run --config ./vitest-unit.config.mts --inspect-brk --no-file-parallelism --test-timeout=0 <文件路径>`。
