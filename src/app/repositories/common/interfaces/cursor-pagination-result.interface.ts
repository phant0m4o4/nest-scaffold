import { Table } from 'drizzle-orm';

import { ICursorKeysetItem } from './cursor-keyset.interface';

/**
 * 游标分页结果接口（仓储层）
 *
 * `meta.nextCursor` 为多列 keyset；对外 API 由 Service 加密为密文字符串。
 */
export interface ICursorPaginationResult<TSchema extends Table> {
  data: TSchema['$inferSelect'][];

  meta: {
    /** 下一页 keyset；没有下一页时为 null */
    nextCursor: ICursorKeysetItem[] | null;
  };
}
