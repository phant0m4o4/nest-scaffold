import { nanoid } from 'nanoid';

/** 默认长度（与 nanoid 默认一致）；列宽见 createPublicIdColumn */
export const PUBLIC_ID_LENGTH = 21;

/**
 * 生成公开标识（nanoid，URL-safe：`A-Za-z0-9_-`）
 *
 * 默认长码；短码传入具体长度即可，例如 `generatePublicId(8)`。
 * 碰撞与查空策略在仓储层（见 `reference/database.md`）。
 */
export function generatePublicId(size: number = PUBLIC_ID_LENGTH): string {
  return nanoid(size);
}
