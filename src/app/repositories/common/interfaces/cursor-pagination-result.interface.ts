import { Table } from 'drizzle-orm';

/**
 * 游标分页结果接口
 */
export interface ICursorPaginationResult<TSchema extends Table> {
  /**
   * 数据列表
   */
  data: TSchema['$inferSelect'][];

  /**
   * 分页元数据
   */
  meta: {
    /**
     * 下一页游标，没有下一页时为 null
     * @example 100
     */
    nextCursor: TSchema['$inferSelect']['id'] | null;
  };
}
