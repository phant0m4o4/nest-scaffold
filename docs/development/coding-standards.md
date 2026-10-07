# 编码规范

目标是让代码清楚、可维护，并与仓库现有写法一致。安全与数据底线见 [工程约定](engineering-conventions.md)。格式细节交给 ESLint / Prettier，不用固定行数或方法数量决定是否拆分代码。

类型、安全、命名和异步处理原则适用于整个工作区；Controller / Service / Repository、Nest 依赖注入和数据库约定适用于 `apps/server`。React 与 Expo 按组件、Hook、路由和状态职责组织，具体见[前端开发](frontends.md)，无需套用服务端分层。

## 工具与类型

- 包管理器统一使用 pnpm，依赖变更同时提交锁文件。
- Node.js、pnpm 版本要求以根 [package.json](../../package.json) 为准，依赖清单看实际应用或包的 `package.json`。通过根脚本或 `pnpm --dir <应用目录> exec` 调用对应工具，无需全局重复安装。
- 不引入 `any`；外部输入用 `unknown`，校验后再收窄。
- 公共边界、函数参数和复杂返回值声明清晰类型；局部变量可使用可靠的类型推导。
- 服务端内部使用 `@/*` → `apps/server/src/*` 路径别名，前端遵循各自构建配置；跨包通过包名引用，不用相对路径穿透其他应用。
- 一个文件围绕一个职责组织；相关类型、常量和聚合导出不必为形式拆成额外文件。
- 代码使用英文命名，注释、文档和测试描述使用中文；解释意图与边界，不重复代码本身。

## 命名

| 对象               | 风格              | 示例                             |
| ------------------ | ----------------- | -------------------------------- |
| 类、类型           | PascalCase        | `UserService`、`UserPayload`     |
| 服务端接口         | 沿用已有 `I` 前缀 | `IPaginationResult`              |
| 变量、函数、方法   | camelCase         | `findOne`、`userId`              |
| 私有成员           | `_` 前缀          | `_logger`、`_buildFilters`       |
| 文件、目录         | kebab-case + dots | `user-profile.service.ts`        |
| 环境变量、固定常量 | UPPER_SNAKE_CASE  | `MYSQL_HOST`、`DEFAULT_LIMIT`    |
| 枚举               | 沿用现有领域契约  | `DemoTypeEnum.TYPE_1 = 'TYPE_1'` |

布尔变量优先 `isX` / `hasX` / `canX`。`__tests__/` 沿用测试目录约定。

前端组件使用 PascalCase，Hook 使用 `useX`；前端和共享包的接口沿用现有无 `I` 前缀的语义名，例如 `ApiClientOptions`。Expo Router 的 `_layout.tsx`、`index.tsx` 等路由文件遵循其约定；不要为统一后端文件后缀而改坏路由结构。

已持久化或对外暴露的枚举值属于数据/API 契约，不因命名风格调整而直接更改。

常用文件后缀：`*.module.ts`、`*.controller.ts`、`*.service.ts`、`*.repository.ts`、`*.dto.ts`、`*.entity.ts`、`*.interface.ts`、`*.type.ts`、`*.schema.ts`。测试后缀见 [测试规范](testing.md)。

## 函数与类

- 单一职责，用早返回减少无意义嵌套；按逻辑分段留空行。
- 多个可选参数、布尔参数或容易混淆的参数适合收为选项对象；`update(id, dto)` 这类清晰签名无需额外封装。
- 优先复用已有模块和直接依赖注入；只在存在实际变化点时引入接口或抽象层。
- 控制器处理 HTTP 边界，服务编排业务，仓储负责数据访问。
- DTO 校验格式和输入范围，服务仍需校验权限、状态转换等业务规则；队列、CLI 等非 HTTP 入口不能假定经过 DTO 管道。
- 可持久化、需重试或跨实例调度的任务使用队列；超时和本地资源清理计时可以使用定时器。

## 设计模式与使用边界

设计模式用于解决具体的变化、复用或协作问题，不是模块必须配齐的目录清单。本节同时说明项目已有的分层与依赖注入约定；提到某个模式不代表脚手架已内置对应功能，也不要求改造现有代码来凑模式。

### 选用原则

- **保持简单、按需设计（KISS / YAGNI）**：先用清晰函数、选项对象或现有服务解决问题；少量稳定的 `if` / `switch` 不必改成策略类、注册中心或插件系统。
- **按职责和真实变化点拆分**：业务规则、数据访问、外部 SDK 接入各有明确归属。单一实现可以直接注入具体类；需要隔离外部依赖或替换实现时，再定义足够小的契约，不为每个类机械添加接口。
- **组合优先于继承**：通过注入服务或组合函数复用能力。沿用已有仓储基类，但不因此增加通用 `BaseService` / `BaseController` 或多层继承；只有稳定的共同流程确实需要受控扩展时，才考虑模板方法。
- **复用语义，而不只是相似代码（DRY）**：同一业务规则集中维护；外形相似但变化原因不同的逻辑不强行合并。遵循单一职责、接口隔离和可替换性等 SOLID 原则，但不以接口或类的数量衡量设计质量；替换实现时核对输入输出、错误与副作用契约。

### 常见模式的选用

| 模式 / 做法              | 适用场景                                              | 本项目的落地与边界                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓储（Repository）       | 集中表查询与数据写入，供业务服务调用                  | 沿用 [DemoRepository](../../apps/server/src/app/repositories/demo.repository.ts) 和已有仓储基类；跨仓储事务由服务编排并显式传递 `tx`，不再套一层通用 DAO。                                                        |
| 工厂函数 / 简单工厂      | 根据已校验配置创建客户端或选择实现                    | 参考 [createRedisClient](../../apps/server/src/common/utils/redis/redis.factory.ts)；它不是依赖子类覆写创建方法的工厂方法模式。简单分支保留函数即可，资源归属与关闭责任不能藏在工厂后面。                         |
| 策略（Strategy）         | 同一任务已有多种可替换算法或业务规则，且会独立变化    | 无状态规则优先使用统一签名的函数；有依赖或生命周期时使用注入的 Provider。明确选择规则，未知策略报错，不静默选默认实现；不要仅因出现分支就拆策略类。                                                               |
| 适配器（Adapter）        | 把外部 SDK 的协议、类型或调用方式收敛为项目需要的接口 | 参考 [StorageService](../../apps/server/src/common/modules/storage/storage.service.ts) 对 S3 SDK 的封装，业务不散落 SDK 调用。只封装实际使用的能力，不预建多后端框架，更不能增加本地文件回退。                    |
| 外观（Facade）与组合编排 | 调用方需要一个职责清楚的入口来组合已有能力            | 可参考 [UploaderService](../../apps/server/src/common/modules/storage/uploader.service.ts) 组合 Storage 完成直传签发与核验的做法；普通服务编排不必改名为 Facade，也不必拆成新模块。不要把无关业务收进万能管理器。 |
| 装饰（Decorator）        | 保持原有契约，为对象或函数增加可组合的行为            | 按需使用包装对象或高阶函数，不改变原有异常、取消和资源释放语义。HTTP 横切逻辑优先使用 Nest 扩展点；TypeScript 的 `@...` 装饰器语法不等于对象装饰模式。                                                            |
| 状态（State）            | 同一业务对象在不同状态下的行为差异较大，转换规则复杂  | 简单流程先用枚举、允许的状态转换和服务校验；复杂到难以维护时再考虑状态对象或状态机。模式本身不能解决并发更新，仍需事务、条件更新或版本校验。                                                                      |
| 观察者 / 发布订阅        | 同一事件需要通知多个独立处理者，调用方不依赖即时结果  | 同步必需步骤保留显式调用；进程内事件不保证持久化或跨实例投递。需重试、持久化或跨实例处理时优先使用已有 [QueueModule](../modules/queue.md)，消费方处理幂等。当前未装配通用事件总线，不为普通调用额外引入依赖。     |

数据库提交与队列投递不属于同一事务，不能把“提交后发事件 / 入队”写成原子操作。只有明确要求可靠投递时，才按业务评估事务发件箱（Outbox）等方案，不把它作为所有业务模块的默认配置。分层和事务细节见[业务模块开发](module-development.md)与[数据库](database.md)。

### NestJS 中如何落地

- **依赖由容器装配**：业务服务使用构造注入，不自行 `new` 受 Nest 管理的服务。复用 Provider 时导入其模块及导出的能力，不在多个模块重复注册同一个服务；需要让新 token 指向已有实例时使用 `useExisting`，不要用 `useClass` 假装别名。工厂装配按需使用 `useFactory`。参见 [Nest 自定义 Provider](https://docs.nestjs.com/fundamentals/custom-providers)。
- **接口不是运行时 token**：TypeScript 接口编译后不存在；按接口注入时，使用共享导出的 `Symbol` / 字符串 token 配合 `@Inject()`，或使用抽象类作为运行时 token。不需要替换实现时，直接注入具体 Provider 即可。参见 [接口与抽象类注入](https://docs.nestjs.com/fundamentals/custom-providers#interfaces-and-abstract-classes)。
- **不手写全局单例**：默认 Provider 实例由 Nest 按注册与作用域管理，并非跨进程唯一。共享实例字段不能保存“当前用户”、请求参数或当前事务；这类上下文优先显式传参。确需请求作用域时评估其向依赖方传播和实例创建成本。参见 [Nest 注入作用域](https://docs.nestjs.com/fundamentals/injection-scopes)。
- **横切逻辑使用对应扩展点**：HTTP 认证授权入口用 Guard，输入转换与校验用 Pipe，请求前后处理与响应映射用 Interceptor，异常映射用 Filter。业务状态和资源归属规则仍放在适当的业务层，不能假设队列或 CLI 会经过 HTTP 链路。已有响应封装见 [GlobalResponseInterceptor](../../apps/server/src/app/interceptors/global-response.interceptor.ts)，机制见 [Nest 拦截器](https://docs.nestjs.com/interceptors)。

### 避免的做法与验证要求

- 不为单一实现预建抽象工厂、多层接口和通用插件框架；Builder、Command、CQRS、事件溯源或微服务也不是普通 CRUD 的默认配套。
- 不把业务塞进万能 `Manager` / `utils`，不以 `ModuleRef.get()` 到处查找服务隐藏依赖；出现循环依赖先检查职责和调用方向，不把 `forwardRef()` 当作默认解决方案。
- 引入模式时，在代码或变更说明中讲清它解决的实际问题即可，不另建固定设计报告。测试覆盖各实现的公共契约、选择分支、非法输入及失败路径；涉及状态流转或副作用时补并发、幂等与清理验证，仍须遵守[测试安全边界](testing.md#测试安全边界)。

## 异常与异步

- 不吞异常。只有能恢复、重试或补充必要上下文时才捕获；否则交由既有上层处理。
- 仓储使用项目异常类型与对应方言错误映射，HTTP 映射交给全局异常过滤器。
- Promise 必须等待或明确处理拒绝；`void` 本身不能处理异步错误。
- 独立操作可用 `Promise.all`；需要顺序、共享事务连接或受并发限制时不要盲目并行。
- 多表一致性使用数据库事务，并将 `tx` 传给仓储的 `db` 参数，见 [数据库](database.md)。
- 长期运行服务不调用用于 seed 的 `unique()` / `uniqueArray()`；它们会持有进程内集合。

## 格式与检查

各应用的 ESLint 配置（如 [API 配置](../../apps/server/eslint.config.mjs)）和根 [Prettier](../../.prettierrc) 是可执行的格式依据；前端与共享代码边界见[前端开发](frontends.md)。

`pnpm lint:check` 同时执行代码 ESLint 与 Markdown 的 Prettier 检查；两者任何一项失败，命令都会失败，CI 使用同一入口。Markdown 检查覆盖根目录、`docs/`、`reports/` 与 `scripts/` 中的文档及可格式化代码块，不代表对示例执行了 TypeScript 类型检查或业务验证。

使用 VS Code 时安装 ESLint（`dbaeumer.vscode-eslint`）和 Prettier（`esbenp.prettier-vscode`）扩展，并从仓库根目录打开工作区。[工作区设置](../../.vscode/settings.json) 已启用保存时格式化与显式保存时的 ESLint 自动修复。其他编辑器使用相同的项目配置，不另行维护一套格式规则；编辑器自动修复不能代替命令行检查。

```bash
pnpm lint:check
# 自动修复代码 ESLint 问题并格式化文档
pnpm lint
# 格式化工作区源码
pnpm format
# 仅检查 / 格式化 Markdown 文档
pnpm format:docs:check
pnpm format:docs
```

检查和测试按变更范围选择，见 [开发流程](workflows.md)。不要为通过检查削弱规则、类型或测试断言。
