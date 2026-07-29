/**
 * 游标分页 keyset（键集）单项
 *
 * 与 ORDER BY 对齐；仓储层用其拼多列翻页条件。
 * value 禁止 null（第一版）。
 */
export interface ICursorKeysetItem {
  column: string;
  direction: 'asc' | 'desc';
  value: string | number;
}
