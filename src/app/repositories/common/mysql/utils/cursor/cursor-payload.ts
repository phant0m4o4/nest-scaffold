import { ICursorKeysetItem } from '@/app/repositories/common/interfaces/cursor-keyset.interface';

/**
 * 加密游标明文载荷（无版本号；结构变更则旧 cursor 全体作废）
 */
export type CursorPayload = {
  /** resourceKey + ':' + 筛选 hash，绑定列表上下文 */
  scope: string;
  /** 多列 keyset（含末行各列值）；最后一列必须是 id */
  order: ICursorKeysetItem[];
};
