import type { Column } from 'drizzle-orm';

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
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new Error('游标整数超出 JavaScript 安全范围');
    }
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'bigint') {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) {
      throw new Error('游标整数超出 JavaScript 安全范围');
    }
    return number;
  }
  throw new Error('不支持的游标排序列类型');
}

/**
 * 仅为日期类型列恢复 Date；字符串列即使看起来像 ISO 日期也保留原值。
 */
export function coerceCursorValueForQuery(
  value: string | number,
  dataType: Column['dataType'],
): string | number | Date {
  if (dataType !== 'date' || typeof value === 'number') {
    return value;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return value;
}
