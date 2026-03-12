import { MySqlTable } from 'drizzle-orm/mysql-core';

/**
 * 普通分页结果接口
 */
export interface IPaginationResult<TSchema extends MySqlTable> {
  /**
   * 数据列表
   */
  data: TSchema['$inferSelect'][];

  /**
   * 分页元数据
   */
  meta: {
    /**
     * 当前页码
     */
    page: number;

    /**
     * 每页条数
     */
    pageSize: number;

    /**
     * 总记录数
     */
    total: number;

    /**
     * 总页数
     */
    totalPages: number;

    /**
     * 是否有上一页
     */
    hasPreviousPage: boolean;

    /**
     * 是否有下一页
     */
    hasNextPage: boolean;
  };
}
