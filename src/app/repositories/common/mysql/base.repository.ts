import { MySqlDatabaseType } from '@/common/modules/database/mysql/common/types/mysql-database.type';
import { UTC } from '@/common/utils/date-time';
import {
  coerceCursorValueForQuery,
  serializeCursorValue,
} from '@/app/repositories/common/mysql/utils/cursor/serialize-cursor-value';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  SQL,
} from 'drizzle-orm';
import { getTableConfig, MySqlTable } from 'drizzle-orm/mysql-core';
import { RecordNotFoundException } from '../exceptions/record-not-found-exception';
import { ICursorKeysetItem } from '../interfaces/cursor-keyset.interface';
import { ICursorPaginationResult } from '../interfaces/cursor-pagination-result.interface';
import { IOrderOption } from '../interfaces/order-option.interface';
import { IPaginationResult } from '../interfaces/pagination-result.interface';
import { mapMysqlErrorAndThrow } from './utils/mysql-error-mapper.util';

/**
 * 通用仓储基类
 *
 * 封装 Drizzle ORM 常用 CRUD、分页、软删除等数据访问逻辑，
 * 业务仓储只需继承并传入对应 Schema 即可获得完整能力。
 *
 * 约束：表必须拥有 `id` 列（int 类型、主键）。
 */
export abstract class BaseRepository<TSchema extends MySqlTable> {
  /** 数据库实例 */
  protected readonly _db: MySqlDatabaseType;
  /** 数据表 Schema */
  protected readonly _schema: TSchema;
  /** 软删除字段名 */
  protected readonly _softDeleteColumn = 'deletedAt';
  /** 是否启用软删除 */
  protected readonly _isSoftDelete: boolean;
  /** 表配置元数据 */
  protected readonly _tableConfig: ReturnType<typeof getTableConfig>;

  protected constructor(schema: TSchema, db: MySqlDatabaseType) {
    this._schema = schema;
    this._db = db;
    this._tableConfig = getTableConfig(schema);
    const columns = this._tableConfig.columns;
    this._isSoftDelete = !!columns.find(
      (column) => column.name === this._softDeleteColumn,
    );
    const hasValidIdColumn = this._tableConfig.columns.some(
      (c) => c.name === 'id' && c.primary && c.dataType === 'number',
    );
    if (!hasValidIdColumn) {
      throw new Error(
        `${this._tableConfig.name}: 必须存在 id 列且为主键且类型为 int`,
      );
    }
  }

  /**
   * 通过主键查找单条记录
   * @param options.db 数据库事务实例（可选）
   * @param options.id 主键值
   * @returns 记录对象或 null
   */
  public async findOne(options: {
    db?: MySqlDatabaseType;
    id: TSchema['$inferSelect']['id'];
  }): Promise<TSchema['$inferSelect'] | null> {
    const { db = this._db, id } = options;
    const result = await this.findMany({
      db,
      filter: [eq(this._schema['id'], id)],
      limit: 1,
    });
    return result[0] ?? null;
  }

  /**
   * 查询所有记录
   * @param options.db 数据库事务实例（可选）
   * @param options.order 排序（默认按 id 升序）
   * @returns 所有记录数组
   */
  public async findAll(
    options: {
      db?: MySqlDatabaseType;
      order?: IOrderOption | IOrderOption[];
    } = {},
  ): Promise<TSchema['$inferSelect'][]> {
    // 走 findMany，确保自动附加软删除过滤（deletedAt IS NULL）
    return this.findMany({
      db: options.db,
      order: options.order,
    });
  }

  /**
   * 根据条件查找多条记录
   * @param options.db 数据库事务实例（可选）
   * @param options.filter 查询条件，已自动附加软删除过滤
   * @param options.order 排序（默认按 id 升序）
   * @param options.limit 限制条数
   * @returns 符合条件的记录数组
   */
  public async findMany(
    options: {
      db?: MySqlDatabaseType;
      filter?: SQL[] | SQL;
      limit?: number;
      order?: IOrderOption | IOrderOption[];
    } = {},
  ): Promise<TSchema['$inferSelect'][]> {
    const { db = this._db, filter, limit, order } = options;
    const query = db.select().from(this._schema);
    const whereFilter = this._buildWhereFilter(filter);
    if (whereFilter) {
      query.where(whereFilter);
    }
    query.orderBy(
      ...this._buildOrder(order ?? { column: 'id', direction: 'asc' }),
    );
    if (limit) {
      query.limit(limit);
    }
    return await query;
  }

  /**
   * 普通分页查询
   * @param options.db 数据库事务实例（可选）
   * @param options.page 页码（>=1）
   * @param options.pageSize 每页条数（>=1）
   * @param options.filter 查询条件，已自动附加软删除过滤
   * @param options.order 排序（默认按 id 升序）
   * @returns 分页结果（data + meta）
   */
  public async findManyWithPagination(options: {
    db?: MySqlDatabaseType;
    page: number;
    pageSize: number;
    filter?: SQL[] | SQL;
    order?: IOrderOption | IOrderOption[];
  }): Promise<IPaginationResult<TSchema>> {
    const { db = this._db, page, pageSize, filter, order } = options;
    const offset = (page - 1) * pageSize;
    // 无业务 filter 时仍须走 _buildWhereFilter，否则软删除条件会被跳过
    const whereFilter = this._buildWhereFilter(filter);
    const countQuery = db.select({ count: count() }).from(this._schema);
    if (whereFilter) {
      countQuery.where(whereFilter);
    }
    const totalResult = await countQuery;
    const total = totalResult[0]?.count ?? 0;
    const dataQuery = db.select().from(this._schema);
    if (whereFilter) {
      dataQuery.where(whereFilter);
    }
    dataQuery.orderBy(
      ...this._buildOrder(order ?? { column: 'id', direction: 'asc' }),
    );
    dataQuery.limit(pageSize).offset(offset);
    const data = await dataQuery;
    const totalPages = Math.ceil(total / pageSize);
    const hasPreviousPage = page > 1;
    const hasNextPage = page < totalPages;
    return {
      data,
      meta: { page, pageSize, total, totalPages, hasPreviousPage, hasNextPage },
    };
  }

  /**
   * 游标分页查询（多列 keyset）
   *
   * @param options.cursor 上一页末行的 keyset（column/direction/value）；对外密文由 Service 编解码
   * @returns data + meta.nextCursor（keyset 数组或 null）
   */
  public async findManyWithCursorPagination(options: {
    db?: MySqlDatabaseType;
    limit: number;
    filter?: SQL[] | SQL;
    order?: IOrderOption | IOrderOption[];
    cursor?: ICursorKeysetItem[];
  }): Promise<ICursorPaginationResult<TSchema>> {
    const { db = this._db, limit, filter, order, cursor } = options;
    const normalizedOrder = this._normalizeCursorOrder(order);
    const filters: SQL[] = [];
    if (filter) {
      if (Array.isArray(filter)) {
        filters.push(...filter);
      } else {
        filters.push(filter);
      }
    }
    if (cursor && cursor.length > 0) {
      this._assertCursorMatchesOrder(cursor, normalizedOrder);
      filters.push(this._buildKeysetWhere(cursor));
    }
    const query = db.select().from(this._schema);
    const whereFilter = this._buildWhereFilter(filters);
    if (whereFilter) {
      query.where(whereFilter);
    }
    query.orderBy(...this._buildOrder(normalizedOrder));
    // 多查一条用于判断是否有下一页
    query.limit(limit + 1);
    const results = await query;
    const hasNextPage = results.length > limit;
    if (hasNextPage) {
      results.pop();
    }
    const nextCursor =
      hasNextPage && results.length > 0
        ? this._buildNextCursorKeyset(
            results[results.length - 1],
            normalizedOrder,
          )
        : null;
    return {
      data: results,
      meta: { nextCursor },
    };
  }

  /**
   * 创建单条记录
   * @param options.db 数据库事务实例（可选）
   * @param options.data 要创建的数据
   * @returns 新记录的 id
   * @throws RecordAlreadyExistsException 唯一键冲突
   */
  public async create(options: {
    db?: MySqlDatabaseType;
    data: TSchema['$inferInsert'];
  }): Promise<TSchema['$inferSelect']['id']> {
    const { db = this._db, data } = options;
    try {
      const resultIds = (await db
        .insert(this._schema)
        .values(data)
        .$returningId()) as unknown as { id: TSchema['$inferSelect']['id'] }[];
      if (resultIds.length !== 1) {
        throw new Error(`创建${this._tableConfig.name}失败: 0 行受影响`);
      }
      return resultIds[0]['id'];
    } catch (error) {
      mapMysqlErrorAndThrow(error);
    }
  }

  /**
   * 批量创建记录
   * @param options.db 数据库事务实例（可选）
   * @param options.data 要创建的数据数组
   * @returns 创建的记录 id 数组
   * @throws RecordAlreadyExistsException 唯一键冲突
   */
  public async batchCreate(options: {
    db?: MySqlDatabaseType;
    data: TSchema['$inferInsert'][];
  }): Promise<{ id: TSchema['$inferSelect']['id'] }[]> {
    const { db = this._db, data } = options;
    try {
      return (await db
        .insert(this._schema)
        .values(data)
        .$returningId()) as unknown as {
        id: TSchema['$inferSelect']['id'];
      }[];
    } catch (error) {
      mapMysqlErrorAndThrow(error);
    }
  }

  /**
   * 通过 ID 更新记录
   * @param options.db 数据库事务实例（可选）
   * @param options.id 记录 ID
   * @param options.data 要更新的数据
   * @throws RecordNotFoundException 记录不存在
   */
  public async update(options: {
    db?: MySqlDatabaseType;
    id: TSchema['$inferSelect']['id'];
    data: Partial<TSchema['$inferSelect']>;
  }): Promise<void> {
    const { db = this._db, id, data } = options;
    try {
      const existingRecord = await this.findOne({ db, id });
      if (!existingRecord) {
        throw new RecordNotFoundException(
          `${this._tableConfig.name} 不存在: {id: ${String(id)}}`,
        );
      }
      await db.update(this._schema).set(data).where(eq(this._schema['id'], id));
    } catch (error) {
      mapMysqlErrorAndThrow(error);
    }
  }

  /**
   * 通过 ID 删除记录（支持软删除）
   * @param options.db 数据库事务实例（可选）
   * @param options.id 记录 ID
   * @throws RecordNotFoundException 记录不存在
   */
  public async delete(options: {
    db?: MySqlDatabaseType;
    id: TSchema['$inferSelect']['id'];
  }): Promise<void> {
    const { db = this._db, id } = options;
    const existingRecord = await this.findOne({ db, id });
    if (!existingRecord) {
      throw new RecordNotFoundException(
        `${this._tableConfig.name} 不存在: {id: ${String(id)}}`,
      );
    }
    if (this._isSoftDelete) {
      await db
        .update(this._schema)
        .set({
          [this._softDeleteColumn]: UTC().toDate(),
        } as Partial<TSchema['$inferSelect']>)
        .where(eq(this._schema['id'], id));
    } else {
      await db.delete(this._schema).where(eq(this._schema['id'], id));
    }
  }

  /**
   * 批量删除记录（支持软删除）
   * @param options.db 数据库事务实例（可选）
   * @param options.ids 要删除的记录 ID 数组
   * @throws RecordNotFoundException 部分记录不存在
   */
  public async batchDelete(options: {
    db?: MySqlDatabaseType;
    ids: TSchema['$inferSelect']['id'][];
  }): Promise<void> {
    const { db = this._db, ids } = options;
    if (ids.length === 0) {
      return;
    }
    const existingRecords = await this.findMany({
      db,
      filter: [inArray(this._schema['id'], ids)],
    });
    if (existingRecords.length !== ids.length) {
      const existingIds = existingRecords.map(
        (record) => record['id'] as TSchema['$inferSelect']['id'],
      );
      const missingIds = ids.filter(
        (id) => !(existingIds as unknown[]).includes(id),
      );
      throw new RecordNotFoundException(
        `${this._tableConfig.name} 不存在: {ids: [${missingIds.join(', ')}]}`,
      );
    }
    if (this._isSoftDelete) {
      await db
        .update(this._schema)
        .set({
          [this._softDeleteColumn]: UTC().toDate(),
        } as Partial<TSchema['$inferSelect']>)
        .where(inArray(this._schema['id'], ids));
    } else {
      await db.delete(this._schema).where(inArray(this._schema['id'], ids));
    }
  }

  /**
   * 检查记录是否存在
   * @param options.db 数据库事务实例（可选）
   * @param options.filters 查询条件
   * @returns 是否存在
   */
  public async isExists(options: {
    db?: MySqlDatabaseType;
    filters: SQL[];
  }): Promise<boolean> {
    const { db = this._db, filters } = options;
    const record = await this.findMany({ db, filter: filters, limit: 1 });
    return record.length > 0;
  }

  /**
   * 统计记录数量
   * @param options.db 数据库事务实例（可选）
   * @param options.filter 查询条件
   * @returns 记录数量
   */
  public async count(
    options: {
      db?: MySqlDatabaseType;
      filter?: SQL[] | SQL;
    } = {},
  ): Promise<number> {
    const { db = this._db, filter } = options;
    const query = db.select({ count: count() }).from(this._schema);
    const whereFilter = this._buildWhereFilter(filter);
    if (whereFilter) {
      query.where(whereFilter);
    }
    const result = await query;
    return result[0]?.count ?? 0;
  }

  // ---------- 受保护方法 ----------

  /**
   * 构建 WHERE 过滤条件（自动附加软删除过滤）
   * @param filter 查询条件
   * @param ignoreSoftDelete 是否忽略软删除（默认 false）
   * @returns SQL 条件或 undefined
   */
  protected _buildWhereFilter(
    filter?: SQL[] | SQL,
    ignoreSoftDelete: boolean = false,
  ): SQL | undefined {
    const filters: SQL[] = [];
    if (!ignoreSoftDelete && this._isSoftDelete) {
      const softDeleteCol = (this._schema as unknown as Record<string, SQL>)[
        this._softDeleteColumn
      ];
      filters.push(isNull(softDeleteCol));
    }
    if (filter) {
      if (Array.isArray(filter)) {
        filters.push(...filter);
      } else {
        filters.push(filter);
      }
    }
    return filters.length > 0 ? and(...filters) : undefined;
  }

  /**
   * 构建排序 SQL 片段
   *
   * 将业务排序配置（列名 + 方向）转换为 Drizzle ORM 的 SQL 片段数组。
   * 支持单列与多列排序，按传入顺序依次应用。
   *
   * @param order 排序配置，支持单个或数组
   * @returns SQL[] 可直接传入 query.orderBy(...sqls)
   * @throws Error 列名在当前 Schema 中不存在
   */
  protected _buildOrder(order: IOrderOption | IOrderOption[]): SQL[] {
    const options: IOrderOption[] = Array.isArray(order) ? order : [order];
    return options.map((option) => {
      const column = (this._schema as unknown as Record<string, unknown>)[
        option.column
      ];
      if (!column) {
        throw new Error(
          `${this._tableConfig.name}: 无效的排序列: ${option.column}`,
        );
      }
      return option.direction === 'desc'
        ? desc(column as unknown as SQL)
        : asc(column as unknown as SQL);
    });
  }

  // ---------- 私有方法 ----------

  /** 规范化游标排序：默认 id desc（与 API 缺省一致）；最后一列必须是 id */
  private _normalizeCursorOrder(
    order?: IOrderOption | IOrderOption[],
  ): IOrderOption[] {
    const normalized: IOrderOption[] = Array.isArray(order)
      ? order
      : order
        ? [order]
        : [{ column: 'id', direction: 'desc' }];
    if (normalized.length === 0) {
      throw new Error(`${this._tableConfig.name}: 游标排序不能为空`);
    }
    if (normalized[normalized.length - 1].column !== 'id') {
      throw new Error(`${this._tableConfig.name}: 游标排序最后一列必须是 id`);
    }
    return normalized;
  }

  private _assertCursorMatchesOrder(
    cursor: ICursorKeysetItem[],
    order: IOrderOption[],
  ): void {
    if (cursor.length !== order.length) {
      throw new Error(
        `${this._tableConfig.name}: 游标 keyset 与 order 列数不一致`,
      );
    }
    for (let index = 0; index < order.length; index++) {
      if (
        cursor[index].column !== order[index].column ||
        cursor[index].direction !== order[index].direction
      ) {
        throw new Error(
          `${this._tableConfig.name}: 游标 keyset 与 order 声明不一致`,
        );
      }
    }
  }

  /**
   * 多列 keyset WHERE：前缀相等 + 当前列按方向严格大于/小于
   */
  private _buildKeysetWhere(cursor: ICursorKeysetItem[]): SQL {
    const branches: SQL[] = [];
    for (let index = 0; index < cursor.length; index++) {
      const equalities: SQL[] = [];
      for (let prefix = 0; prefix < index; prefix++) {
        equalities.push(
          eq(
            this._schemaColumn(cursor[prefix].column),
            coerceCursorValueForQuery(cursor[prefix].value),
          ),
        );
      }
      const current = cursor[index];
      const column = this._schemaColumn(current.column);
      const value = coerceCursorValueForQuery(current.value);
      const comparison =
        current.direction === 'desc' ? lt(column, value) : gt(column, value);
      branches.push(
        equalities.length > 0 ? and(...equalities, comparison)! : comparison,
      );
    }
    return or(...branches)!;
  }

  private _buildNextCursorKeyset(
    row: TSchema['$inferSelect'],
    order: IOrderOption[],
  ): ICursorKeysetItem[] {
    return order.map((item) => ({
      column: item.column,
      direction: item.direction,
      value: serializeCursorValue(
        (row as Record<string, unknown>)[item.column],
      ),
    }));
  }

  private _schemaColumn(columnName: string): SQL {
    const column = (this._schema as unknown as Record<string, unknown>)[
      columnName
    ];
    if (!column) {
      throw new Error(`${this._tableConfig.name}: 无效的游标列: ${columnName}`);
    }
    return column as unknown as SQL;
  }
}
