# 业务模块开发约定

## 模块组成

每个业务域 `src/app/api/<domain>/` 是自包含单元，包括：

| 文件/目录 | 职责 |
|----------|------|
| `<domain>.module.ts` | NestJS 模块定义，`imports: [RepositoryModule.forFeature([<Domain>Repository])]` |
| `<domain>.controller.ts` | 路由 + 入参校验 + 调用服务 + 组装响应 |
| `<domain>.service.ts` | 业务逻辑，组合仓储/缓存/锁/队列等 |
| `dtos/` | 请求/参数 DTO（`@DtoSchema` + class-validator） |
| `entities/<domain>.entity.ts` | 响应实体（`@Expose` 字段） |
| `interfaces/` | 业务领域接口（`I*.interface.ts`） |
| `__tests__/` | `*.spec.ts` 单测 + `*.e2e-spec.ts` E2E |

仓储 `<Domain>Repository` 放在 `src/app/repositories/<domain>.repository.ts`。

## 控制器写法

```ts
@Controller('<domain>')
export class <Domain>Controller {
  constructor(protected readonly <domain>Service: <Domain>Service) {}

  @CreatedResponse(OnlyIdEntity)
  @Post()
  async create(@Body() body: Create<Domain>RequestDto) {
    const id = await this.<domain>Service.create(body);
    return {
      data: plainToInstance(OnlyIdEntity, { id }, { excludeExtraneousValues: true }),
    };
  }

  @ArrayOkResponse(<Domain>Entity)
  @Get('all')
  async findAll() {
    const rows = await this.<domain>Service.findAll();
    return {
      data: rows.map((row) =>
        plainToInstance(<Domain>Entity, row, { excludeExtraneousValues: true }),
      ),
    };
  }

  @CursoredPaginationOkResponse(<Domain>Entity)
  @Get()
  async findManyByCursorPagination(
    @Query() query: FindMany<Domain>ByCursoredPaginationRequestDto,
  ) {
    const { data, meta } =
      await this.<domain>Service.findManyByCursorPagination(query);
    return {
      data: data.map((row) =>
        plainToInstance(<Domain>Entity, row, { excludeExtraneousValues: true }),
      ),
      meta,
    };
  }

  @OkResponse(<Domain>Entity)
  @Get(':id')
  async findOne(@Param('id') id: number) {
    const row = await this.<domain>Service.findOne(id);
    return {
      data: plainToInstance(<Domain>Entity, row, { excludeExtraneousValues: true }),
    };
  }

  @OkResponse()
  @Patch(':id')
  async update(@Param('id') id: number, @Body() body: Update<Domain>RequestDto) {
    await this.<domain>Service.update(id, body);
  }

  @OkResponse()
  @Delete(':id')
  async remove(@Param('id') id: number) {
    await this.<domain>Service.delete(id);
  }
}
```

控制器 5 条核心约束：

1. `protected readonly <domain>Service: <Domain>Service` 注入服务。
2. 入参 DTO + `@Body` / `@Query` / `@Param` 装饰器；不直接读 `req`。
3. 返回 `{ data?, meta? }`，由全局拦截器套上 `statusCode`。
4. 单条返回前必须 `plainToInstance(Entity, row, { excludeExtraneousValues: true })`。
5. 每个方法挂对应 `@OkResponse` / `@CreatedResponse` / `@CursoredPaginationOkResponse` / `@ArrayOkResponse`。

## 服务写法

```ts
@Injectable()
export class <Domain>Service {
  constructor(protected readonly <domain>Repository: <Domain>Repository) {}

  async create(body: Create<Domain>RequestDto) {
    return await this.<domain>Repository.create({ data: body });
  }

  async findAll() {
    return await this.<domain>Repository.findAll({});
  }

  async findManyByCursorPagination(query: FindMany<Domain>ByCursoredPaginationRequestDto) {
    const { cursor, limit, orderColumn, orderDirection, ...filterOptions } = query;
    const filters = this._buildFilters(filterOptions);
    return await this.<domain>Repository.findManyWithCursorPagination({
      limit: limit ?? 30,
      cursor,
      order: {
        column: orderColumn ?? 'id',
        direction: (orderDirection ?? 'desc') as 'asc' | 'desc',
      },
      filter: filters,
    });
  }

  async findOne(id: number) {
    return await this.<domain>Repository.findOne({ id });
  }

  async update(id: number, body: Update<Domain>RequestDto) {
    return await this.<domain>Repository.update({ id, data: body });
  }

  async delete(id: number) {
    return await this.<domain>Repository.delete({ id });
  }

  private _buildFilters(options: I<Domain>FilterOptions): SQL[] {
    const filters: SQL[] = [];
    // 按 options.* 推入 eq/like/gte/lte 等
    return filters;
  }
}
```

约束：

- 服务只调用 `<Domain>Repository`、其他服务、缓存/锁/队列；**不要**直接调 `databaseService.db`，除非有特殊事务需求。
- 复杂过滤抽到 `_buildFilters` 私有方法（`_` 前缀）。
- 涉及多张表写入时使用事务：`databaseService.db.transaction(async (tx) => { ... })`，把 `tx` 传给仓储 `db` 字段。

## 仓储写法

业务仓储继承 `BaseRepository`：

```ts
@Injectable()
export class <Domain>Repository extends BaseRepository<typeof <domain>Schema> {
  constructor(
    private readonly _databaseService: DatabaseService,
    @InjectPinoLogger(<Domain>Repository.name)
    protected readonly _logger: PinoLogger,
  ) {
    super(<domain>Schema, _databaseService.db);
  }

  /** 表特有的查询方法 */
  async findOneByName(options: { db?: MySqlDatabaseType; name: string }) {
    const { db = this._db, name } = options;
    const results = await db
      .select()
      .from(<domain>Schema)
      .where(eq(<domain>Schema.name, name))
      .limit(1);
    return results[0] ?? null;
  }
}
```

`BaseRepository` 已经提供：

- `findOne({ db?, id })`
- `findAll({ db?, order? })`
- `findMany({ db?, filter?, limit?, order? })`
- `findManyWithPagination({ db?, page, pageSize, filter?, order? })`
- `findManyWithCursorPagination({ db?, limit, cursor?, filter?, order? })`
- `create({ db?, data })`
- `batchCreate({ db?, data })`
- `update({ db?, id, data })`
- `delete({ db?, id })`、`batchDelete({ db?, ids })`
- `isExists({ db?, filters })`、`count({ db?, filter? })`

软删除：表里包含 `deletedAt: timestamp()` 列时自动启用，所有查询自动过滤已删除行，`delete` 改为更新 `deletedAt`。

`db` 参数支持事务：调用方传入 `tx` 即在事务内执行。

仓储错误：MySQL 的唯一键冲突、外键、死锁等错误统一通过 `mapMysqlErrorAndThrow` 转为：

- `RecordAlreadyExistsException`
- `ForeignKeyConstraintViolationException`
- `DataIntegrityViolationException`
- `DeadlockDetectedException`
- `LockWaitTimeoutException`
- `RepositoryException`（兜底）

业务层无需 try/catch，让全局过滤器处理。

## 模块装配

```ts
@Module({
  imports: [RepositoryModule.forFeature([<Domain>Repository])],
  controllers: [<Domain>Controller],
  providers: [<Domain>Service],
})
export class <Domain>Module {}
```

随后在 `src/app/api/api.module.ts` 中加入：

```ts
@Module({
  imports: [<Domain>Module, ...],
})
export class ApiModule {}
```

## 鉴权（如启用 JWT）

- 控制器级别挂 Guard：`@JwtAuthGuard()`。
- 公开端点用 `@AuthPublic()` 跳过。
- 默认私有，对外接口显式标注公开。

## 跨模块复用

- 不要在业务模块里直接 import 别的业务模块的服务；通过领域事件 / 队列 / 抽接口注入解耦。
- 如果确实是通用能力，下沉到 `src/common/`。
