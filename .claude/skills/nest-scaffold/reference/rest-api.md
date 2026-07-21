# RESTful API 规范

## HTTP 动词与状态码

- `GET` 查询、`POST` 创建、`PUT`/`PATCH` 更新、`DELETE` 删除。
- 项目使用 `PATCH` 做部分更新（见 `DemoController.update`）。
- 用 HTTP 状态码反映结果：2xx 成功，4xx 客户端错误，5xx 服务端错误。

## 统一响应结构

由 `GlobalResponseInterceptor` 统一包装：

```json
// 成功
{
  "statusCode": 200,
  "data": { ... },
  "meta": { "nextCursor": 12 }
}

// 创建
{ "statusCode": 201, "data": { "id": 42 } }

// 删除 / 无返回
// 控制器方法返回 void → { statusCode: 200 }

// 错误：所有非 2xx 都是统一信封（GlobalExceptionFilter 保证）
// { statusCode, code, message, errors?: [{ field, code, message }] }
{ "statusCode": 404, "code": "RECORD_NOT_FOUND", "message": "demos 不存在: {id: 999999}" }

// 校验失败（全局 I18nZodValidationPipe 抛 ZodValidationException）
// errors[].code 透传 zod issue code（机器可读、不随语言变），message 随请求语言本地化
{
  "statusCode": 422,
  "code": "VALIDATION_FAILED",
  "message": "Validation Failed",
  "errors": [
    { "field": "email", "code": "too_small", "message": "数值过小：期望 string >=5 字符" }
  ]
}
```

控制器只负责返回 `{ data?, meta? }`，**不要**手动拼 `statusCode`。

仓储异常由 `GlobalExceptionFilter` 映射为语义化状态码（业务代码只需抛出，不要 try-catch 转 HTTP）：

| 仓储异常 | HTTP | code |
|---------|------|------|
| `RecordNotFoundException` | 404 | `RECORD_NOT_FOUND` |
| `RecordAlreadyExistsException` | 409 | `RECORD_ALREADY_EXISTS` |
| `ForeignKeyConstraintViolationException` | 409 | `FOREIGN_KEY_CONSTRAINT_VIOLATION` |
| `DataIntegrityViolationException` | 400 | `DATA_INTEGRITY_VIOLATION` |
| `DeadlockDetectedException` | 409 | `DEADLOCK_DETECTED` |
| `LockWaitTimeoutException` | 503 | `LOCK_WAIT_TIMEOUT` |
| `RepositoryException`（兜底） | 500 | `REPOSITORY_ERROR`（隐藏细节并记日志） |
| 未知异常 | 500 | `INTERNAL_SERVER_ERROR`（隐藏细节并记日志） |

## 分页

### 游标分页（默认推荐）

请求 query：

```ts
{
  cursor?: number;       // 上一页 meta.nextCursor，缺省即第一页
  limit?: number;        // 默认 30，最大 100
  orderColumn?: string;  // 默认 id
  orderDirection?: 'asc' | 'desc'; // 默认 desc
  // ... 业务过滤字段
}
```

继承基类 `FindManyByCursoredPaginationDto`（`src/app/api/common/dtos/`）。

响应：

```json
{
  "statusCode": 200,
  "data": [ ... ],
  "meta": { "nextCursor": 12 }
}
```

由 `BaseRepository.findManyWithCursorPagination` 返回 `{ data, meta: { nextCursor } }`，控制器透传即可。

### 普通分页

继承 `FindManyByPaginationDto`，请求 `{ page, pageSize, orderColumn, orderDirection }`，响应 `{ data, meta: { page, pageSize, total, totalPages, hasPreviousPage, hasNextPage } }`。

## CRUD 命名

| 操作 | 控制器方法 | 服务方法 | 请求 DTO | 响应 |
|------|----------|---------|---------|------|
| 创建 | `create` | `create` | `Create<Resource>RequestDto` | `OnlyIdEntity` 或 `<Resource>Entity` |
| 查询单条 | `findOne` | `findOne` | `FindOne<Resource>ParamDto`（路径参数） | `<Resource>Entity` |
| 列表（无分页） | `findAll` | `findAll` | — | `<Resource>Entity[]` |
| 游标分页 | `findManyByCursorPagination` | `findManyByCursorPagination` | `FindMany<Resource>ByCursoredPaginationRequestDto` | `<Resource>Entity[]` + `nextCursor` |
| 普通分页 | `findManyByPagination` | `findManyByPagination` | `FindMany<Resource>ByPaginationRequestDto` | `<Resource>Entity[]` + 分页 meta |
| 更新 | `update` | `update` | `Update<Resource>RequestDto` + `Update<Resource>ParamDto` | 通常无返回 |
| 删除 | `remove` | `delete`（仓储层） | `Remove<Resource>ParamDto` | 无返回 |

特殊操作命名：

- 通过非 id 查找：`findOne<Action>`（如 `findOneByEmail`）
- 校验：`verify`，DTO `Verify<Resource>RequestDto/ResponseDto`
- 计数：`count`，DTO `Count<Resource>RequestDto/ResponseDto`

## DTO 命名

| 类型 | 命名 | 文件名 |
|------|------|-------|
| 创建请求 | `Create<Resource>RequestDto` | `create-<resource>-request.dto.ts` |
| 更新请求 | `Update<Resource>RequestDto` | `update-<resource>-request.dto.ts` |
| 列表请求 | `FindMany<Resource>RequestDto` 或带 `ByCursoredPagination`/`ByPagination` 后缀 | `find-many-<resource>-request.dto.ts` |
| 路径参数 | `<Action><Resource>ParamDto` | `<action>-<resource>-param.dto.ts` |
| 响应实体 | `<Resource>Entity` 或 `<Resource>ResponseDto` | `<resource>.entity.ts` 或 `<resource>-response.dto.ts` |

路径参数**必须**走 param DTO（`@Param() params: FindOne<Resource>ParamDto`），不要写 `@Param('id') id: number`——全局管道只校验 zod DTO，裸参数不会被校验/转换，运行时拿到的是字符串。路由参数原始值都是字符串，schema 用 `z.coerce.number().int().positive()` 这类 coerce 写法。

DTO 与实体（响应类）一律用 `createZodDto`（项目内轻量工厂，见 `@/common/utils/zod/create-zod-dto`）定义：

```ts
import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

export class CreateDemoRequestDto extends createZodDto(
  z.object({
    name: z.string().min(1),
    type: z.enum(demoTypes),
    parentId: z.number().int().optional(),
  }),
) {}
```

继承/扩展基于 `.schema`：`createZodDto(FindManyByCursoredPaginationDto.schema.extend({ ... }))`；Partial 用 `createZodDto(CreateDemoRequestDto.schema.partial())`。

控制器返回前用：

```ts
MyEntity.create(raw)
```

zod 默认剔除 schema 未声明的字段，起到响应净化作用。

## 控制器示例

```ts
@Controller('demo')
export class DemoController {
  constructor(protected readonly demoService: DemoService) {}

  @Post()
  async create(@Body() body: CreateDemoRequestDto) {
    const id = await this.demoService.create(body);
    return {
      data: OnlyIdEntity.create({ id }),
    };
  }

  @Get()
  async findManyByCursorPagination(
    @Query() query: FindManyDemoByCursoredPaginationRequestDto,
  ) {
    const { data, meta } = await this.demoService.findManyByCursorPagination(query);
    return { data, meta };
  }

  @Get(':id')
  async findOne(@Param() params: FindOneDemoParamDto) {
    const data = await this.demoService.findOne(params.id);
    return { data };
  }
}
```

## 文件组织

```
src/app/api/<domain>/
├── <domain>.controller.ts
├── <domain>.service.ts
├── <domain>.module.ts
├── dtos/
│   ├── create-<domain>-request.dto.ts
│   ├── update-<domain>-request.dto.ts
│   ├── find-many-<domain>-request.dto.ts
│   └── find-one-<domain>-param.dto.ts
├── entities/
│   └── <domain>.entity.ts
├── interfaces/
│   └── <domain>-payload.interface.ts
└── __tests__/
    ├── <domain>.controller.spec.ts
    ├── <domain>.service.spec.ts
    └── <domain>.e2e-spec.ts
```
