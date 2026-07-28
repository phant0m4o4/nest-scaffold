import { PUBLIC_ID_LENGTH } from '@/common/utils/public-id';
import { varchar } from 'drizzle-orm/pg-core';

/**
 * 创建公开标识列（默认列名随字段；默认长度 {@link PUBLIC_ID_LENGTH}）
 *
 * - 长码（路径/读查）：`publicId: createPublicIdColumn()`
 * - 短码（推荐码等）：`shortPublicId: createPublicIdColumn('shortPublicId', 8)`
 *
 * 值由业务仓储重载的 `create` 写入；**必须**在表级加 `unique()`（见 demos schema）。
 * 长短码碰撞策略不同，见 `reference/database.md`。
 */
export const createPublicIdColumn = (
  name?: string,
  length: number = PUBLIC_ID_LENGTH,
) => {
  if (name) {
    return varchar(name, { length }).notNull();
  }
  return varchar({ length }).notNull();
};
