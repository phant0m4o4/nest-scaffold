import { PUBLIC_ID_LENGTH } from '@/common/utils/public-id';
import { varchar } from 'drizzle-orm/pg-core';

/**
 * 创建「公开标识」类 varchar 列（默认长度 {@link PUBLIC_ID_LENGTH}）
 *
 * **列名按业务语义取**，不要机械叫 `publicId` / `shortPublicId`。
 * 本函数只约定「用 nanoid 一类公开串 + 定宽 + 须 unique」，不规定字段名。
 *
 * @example
 * // 长码（路径/读查，默认 21）：订单对外号
 * accessKey: createPublicIdColumn(),
 * // 短码（推荐码等，长度 8）：列名与 generate 长度一致
 * inviteCode: createPublicIdColumn('inviteCode', 8),
 *
 * 值由业务仓储在 `create` 中写入；**必须**表级 `unique()`。
 * 长短策略见 `reference/database.md`。Demo 表用泛化名 `publicId`/`shortPublicId` 仅作示例。
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
