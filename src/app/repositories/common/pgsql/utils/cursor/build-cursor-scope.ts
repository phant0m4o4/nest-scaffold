/**
 * 游标 scope 与方言无关；实现放在 mysql/utils/cursor，此处再导出供 PG 侧统一引用路径。
 */
export {
  buildCursorScope,
  canonicalizeFilterForScope,
} from '@/app/repositories/common/mysql/utils/cursor/build-cursor-scope';
