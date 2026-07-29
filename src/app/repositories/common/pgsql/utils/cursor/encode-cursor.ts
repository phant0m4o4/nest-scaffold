/**
 * 游标编解码与方言无关；实现放在 mysql/utils/cursor，此处再导出供 PG 侧统一引用路径。
 */
export {
  decodeCursor,
  encodeCursor,
} from '@/app/repositories/common/mysql/utils/cursor/encode-cursor';
