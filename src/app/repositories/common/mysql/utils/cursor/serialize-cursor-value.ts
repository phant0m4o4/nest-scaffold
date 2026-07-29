/**
 * 将行字段值序列化为游标可承载的 string | number（禁止 null）
 *
 * 由仓储在组装 nextCursor 时调用；失败抛普通 Error（属服务端数据问题，不应变成 400）。
 */
export function serializeCursorValue(value: unknown): string | number {
  if (value === null || value === undefined) {
    throw new Error('游标排序列不能为 null');
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  throw new Error('不支持的游标排序列类型');
}

/**
 * 将 cursor 中的值转为查询可用值（ISO 日期字符串 → Date）
 */
export function coerceCursorValueForQuery(
  value: string | number,
): string | number | Date {
  if (typeof value === 'number') {
    return value;
  }
  // 仅识别 ISO-8601，避免误伤普通字符串列
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return value;
}
