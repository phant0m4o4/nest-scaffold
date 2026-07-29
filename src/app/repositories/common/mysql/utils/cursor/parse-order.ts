import { IOrderOption } from '@/app/repositories/common/interfaces/order-option.interface';
import { BadRequestException } from '@nestjs/common';

/**
 * 解析游标分页的 `order` query（如 `createdAt:desc,id:desc`）
 *
 * - 缺省为 `id:desc`
 * - 最后一列必须是 `id`
 * - 列名必须落在白名单内
 */
export function parseOrderQuery(
  order: string | undefined,
  allowedColumns: readonly string[],
): IOrderOption[] {
  const raw = (order ?? '').trim() || 'id:desc';
  const segments = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (segments.length === 0) {
    throw new BadRequestException('order 不能为空');
  }

  const allowed = new Set(allowedColumns);
  const seen = new Set<string>();
  const result: IOrderOption[] = [];
  for (const segment of segments) {
    const separatorIndex = segment.lastIndexOf(':');
    if (separatorIndex <= 0 || separatorIndex === segment.length - 1) {
      throw new BadRequestException(
        `无效的 order 段「${segment}」，应为 column:asc|desc`,
      );
    }
    const column = segment.slice(0, separatorIndex);
    const direction = segment.slice(separatorIndex + 1);
    if (direction !== 'asc' && direction !== 'desc') {
      throw new BadRequestException(
        `无效的排序方向「${direction}」，仅支持 asc / desc`,
      );
    }
    if (!allowed.has(column)) {
      throw new BadRequestException(`无效的排序列「${column}」`);
    }
    if (seen.has(column)) {
      throw new BadRequestException(`order 中排序列「${column}」重复`);
    }
    seen.add(column);
    result.push({ column, direction });
  }

  if (result[result.length - 1].column !== 'id') {
    throw new BadRequestException('order 最后一列必须是 id');
  }
  return result;
}

/**
 * 比较请求 order 声明与 cursor 内 order 的 column/direction（不含 value）
 */
export function isSameOrderDeclaration(
  declared: IOrderOption[],
  fromCursor: Array<{ column: string; direction: 'asc' | 'desc' }>,
): boolean {
  if (declared.length !== fromCursor.length) {
    return false;
  }
  return declared.every(
    (item, index) =>
      item.column === fromCursor[index].column &&
      item.direction === fromCursor[index].direction,
  );
}
