/**
 * 游标载荷类型与方言无关；实现放在 mysql/utils/cursor，此处再导出供 PG 侧统一引用路径。
 */
export type { CursorPayload } from '@/common/modules/database/mysql/repositories/utils/cursor/cursor-payload';
