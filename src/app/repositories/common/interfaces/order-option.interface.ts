/**
 * 排序选项接口
 *
 * 用于描述数据查询时的排序列和方向。
 */
export interface IOrderOption {
  /** 列名（对应表的字段属性名，例如 'id'） */
  column: string;
  /** 排序方向 */
  direction: 'asc' | 'desc';
}
