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

// 错误（普通）
{ "statusCode": 400, "error": "Bad Request", "message": "..." }

// 校验失败
{
  "statusCode": 422,
  "message": "Validation failed",
  "errors": {
    "email": { "rule": "isEmail", "message": "邮箱格式不正确" }
  }
}
```

控制器只负责返回 `{ data?, meta? }`，**不要**手动拼 `statusCode`。

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

DTO 类必须用 `@DtoSchema({ name: 'app.api.<domain>.dtos.<dto-name>' })` 装饰，避免 Swagger 模型重名。

实体（响应类）字段加 `@Expose()`，控制器返回前用：

```ts
plainToInstance(MyEntity, raw, { excludeExtraneousValues: true })
```

## Swagger 装饰器

控制器方法上挂对应的成功响应装饰器（见 `src/common/decorators/swagger/responses/`）：

| 装饰器 | 用途 |
|--------|------|
| `@OkResponse(Entity?)` | 200 单对象 |
| `@CreatedResponse(Entity?)` | 201 创建成功 |
| `@ArrayOkResponse(Entity)` | 200 数组（无分页） |
| `@PaginationOkResponse(Entity)` | 200 普通分页 |
| `@CursoredPaginationOkResponse(Entity)` | 200 游标分页 |

## 控制器示例

```ts
@Controller('demo')
export class DemoController {
  constructor(protected readonly demoService: DemoService) {}

  @CreatedResponse(OnlyIdEntity)
  @Post()
  async create(@Body() body: CreateDemoRequestDto) {
    const id = await this.demoService.create(body);
    return {
      data: plainToInstance(OnlyIdEntity, { id }, { excludeExtraneousValues: true }),
    };
  }

  @CursoredPaginationOkResponse(DemoEntity)
  @Get()
  async findManyByCursorPagination(
    @Query() query: FindManyDemoByCursoredPaginationRequestDto,
  ) {
    const { data, meta } = await this.demoService.findManyByCursorPagination(query);
    return { data, meta };
  }

  @OkResponse(DemoEntity)
  @Get(':id')
  async findOne(@Param('id') id: number) {
    const data = await this.demoService.findOne(id);
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
