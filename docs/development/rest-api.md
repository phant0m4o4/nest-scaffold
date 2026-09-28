# REST API

控制器以 [Demo](../../src/app/api/demo/demo.controller.ts) 和 [Admin Demo](../../src/app/api/demo/admin-demo.controller.ts) 为参考，按真实业务需要提供端点，不要求每个资源都实现整套 CRUD。

## 方法与响应

`GET` 查询、`POST` 创建、`PATCH` 部分更新、`DELETE` 删除。用实际 HTTP 状态表达结果，不把所有业务错误包装成 HTTP 200。

控制器返回 `{ data?, meta? }`，由 [GlobalResponseInterceptor](../../src/app/interceptors/global-response.interceptor.ts) 补 `statusCode`，不用手工拼接。

```json
{
  "statusCode": 200,
  "data": [],
  "meta": { "nextCursor": null }
}
```

默认 `POST` 创建返回 201；普通删除或无返回值的方法按当前拦截器行为返回 `{ "statusCode": 200 }`。单条查询缺失的现有 Demo 行为是 `data: null`，并非所有查询都自动抛 404；实际业务需要不同语义时显式定义并测试。

[GlobalExceptionFilter](../../src/app/filters/global-exception.filter.ts) 把应用异常统一为 `{ statusCode, code, message, errors? }`：

| 异常                                     | HTTP / code                              |
| ---------------------------------------- | ---------------------------------------- |
| `RecordNotFoundException`                | 404 / `RECORD_NOT_FOUND`                 |
| `RecordAlreadyExistsException`           | 409 / `RECORD_ALREADY_EXISTS`            |
| `ForeignKeyConstraintViolationException` | 409 / `FOREIGN_KEY_CONSTRAINT_VIOLATION` |
| `DataIntegrityViolationException`        | 400 / `DATA_INTEGRITY_VIOLATION`         |
| `DeadlockDetectedException`              | 409 / `DEADLOCK_DETECTED`                |
| `LockWaitTimeoutException`               | 503 / `LOCK_WAIT_TIMEOUT`                |
| `RepositoryException`                    | 500 / `REPOSITORY_ERROR`                 |
| 未知异常                                 | 500 / `INTERNAL_SERVER_ERROR`            |

未知异常和基础 `RepositoryException` 隐藏内部细节；服务端错误会记录日志。自定义 `HttpException` 的实际状态取 `getStatus()`；其响应对象不能伪造其他状态，过滤器只保留经过类型检查的约定字段。自定义的 `message`、`code`、`errors` 属于对外响应，即使状态为 5xx 也不会自动脱敏；不得把 SQL、凭据或上游原始错误直接放入这些字段。

## DTO 与响应实体

请求及路径参数使用项目的 [createZodDto](../../src/common/utils/zod/create-zod-dto.ts)，由全局 `I18nZodValidationPipe` 校验。不要写裸 `@Param('id') id: number` 并假定 TypeScript 会把字符串转换成数字。

| 类型     | 常用命名                                                         |
| -------- | ---------------------------------------------------------------- |
| 创建请求 | `Create<Resource>RequestDto`，`create-<resource>-request.dto.ts` |
| 更新请求 | `Update<Resource>RequestDto`，`update-<resource>-request.dto.ts` |
| 列表请求 | `FindMany<Resource>RequestDto`，按需要加分页后缀                 |
| 路径参数 | `FindOne<Resource>ParamDto` 或按实际动作命名                     |
| 响应实体 | `<Resource>Entity` / `<Resource>PublicEntity`                    |

复用 DTO 时通过 `.schema.extend(...)` 或 `.partial()` 组合。PATCH 不仅要 partial，还要拒绝净化后不含任何可更新字段的空对象，参考 [UpdateDemoRequestDto](../../src/app/api/demo/dtos/update-demo-request.dto.ts)。

返回数据库数据前使用 `Entity.create(raw)`；zod 对象默认剔除 schema 未声明字段，防止内部 ID、敏感列或新加字段意外外泄。数组逐条净化，管理端与用户端响应实体分别定义。

## 校验与本地化

校验失败返回 HTTP 422：

```json
{
  "statusCode": 422,
  "code": "VALIDATION_FAILED",
  "message": "Validation Failed",
  "errors": [
    {
      "field": "name",
      "code": "too_small",
      "params": { "origin": "string", "minimum": 1, "inclusive": true },
      "message": "名称至少需要 1 个字符"
    }
  ]
}
```

`errors[].message` 由后端按请求语言渲染，客户端可以直接展示。顺序为 schema 显式文案、项目 `src/i18n/<lang>/validation.json`、zod locale 兜底；语言从 `?lang=`、`Accept-Language`、`x-lang` 及回退配置解析。

`field` / `code` / `params` 是机器可读结构，供字段高亮或自定义文案使用；原始输入值不直接回显。新增对外字段或校验规则时同步维护翻译模板与字段名称，具体实现见 [国际化模块](../modules/i18n.md)。

DTO 只负责输入形状。授权、资源归属、业务状态和跨字段业务约束仍需在适当层验证。

## 分页与日期

日期时间筛选使用 `YYYY-MM-DD HH:mm:ss`，按 UTC 转换。项目的 [zUtcDateTime](../../src/common/utils/zod/utc-date-time.ts) 严格检查格式、日历日期和时分秒，不接受自动进位的无效日期。

日期计算和展示可复用 [date-time](../../src/common/utils/date-time/index.ts) 导出的 `UTC`、`Timezone`、`FormatDateTime`；底层 Day.js 已统一注册时区等插件，不必在业务模块重复初始化。格式化工具不代替入参校验。

### 游标分页

适合连续加载列表。请求的 `cursor`、`limit`、`order` 和筛选字段均在 query 中，继承 `FindManyByCursoredPaginationDto`：

- `cursor`：上一页 `meta.nextCursor`，未传表示第一页。
- `limit`：默认 30，最大 100。
- `order`：如 `createdAt:desc,id:desc`，默认 `id:desc`；最后一列必须是 `id`，列不重复且在服务白名单内。
- 支持的游标排序列是非空字符串、数字和日期列；不能把可空列或不可序列化类型直接纳入白名单。
- 数字排序值若为整数，必须处于 JavaScript 安全整数范围；游标生成会拒绝越界 `number` / `bigint`，不静默丢失精度。有限非整数保持原值，安全范围内的 `bigint` 仍按既有协议转为 `number`。

对外游标是 AES-256-GCM 密文，响应 `meta.nextCursor` 为密文字符串或 `null`。使用 `APP_MASTER_KEY`（64 位 hex 解码为 32 字节）；内部载荷包括 `scope` 与各排序列的 `column` / `direction` / `value`。

`scope` 由资源标识和稳定筛选 hash 组成，防止不同筛选或用户/管理列表复用同一游标；请求排序必须与游标声明一致。业务权限范围也需纳入实际查询与隔离设计，加密游标本身不提供授权。

Demo 名称筛选的真正空串与未传等价；非空的空白字符串仍是实际 `LIKE` 条件，必须生成独立 `scope`，不能先 `trim` 后把不同查询合并。

当前载荷无版本号；结构或密钥变化会使旧游标失效。仓储只接收内部 keyset，Service 负责编解码和范围校验。参考 [DemoService](../../src/app/api/demo/demo.service.ts) 和 [查询 DTO](../../src/app/api/demo/dtos/find-many-demo-request.dto.ts)。

### 页码分页

需要跳页或总数时使用 `FindManyByPaginationDto`：请求为 `page` / `pageSize` / `orderColumn` / `orderDirection`，响应 `meta` 包含 `page`、`pageSize`、`total`、`totalPages`、`hasPreviousPage`、`hasNextPage`。

分页选择由产品需求决定，不要求每个列表同时实现两种。`by-page` 等静态路由应声明在 `:publicId` / `:id` 动态路由之前。

## 标识与命名

用户端使用长码资源标识，字段名按业务语义定义；Demo 的 `publicId` 只是示例。短码用于邀请码等便于抄写的场景，不用作普通资源路径标识。管理端可使用内部 `id`，但必须有真实鉴权；详见 [公开标识策略](database.md)。

常用方法名沿用现有模块：`create`、`findOne`、`findAll`、`findManyByCursorPagination`、`findManyByPagination`、`update`、控制器 `remove` / 仓储 `delete`。自定义查找用 `findOneByEmail` 等表达业务含义，不为凑齐固定方法而增加无用接口。

脚手架没有内置完整认证授权系统；Demo 仅在开发/测试环境暴露，不能将管理端路径或长码视为安全屏障。接入要求见 [业务模块开发](module-development.md)。
