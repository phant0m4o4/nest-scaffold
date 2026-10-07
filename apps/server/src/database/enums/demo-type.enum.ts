import { NotEmptyArrayType } from '@/common/modules/database/common/types/not-empty-array.type';

/**
 * 演示类型枚举
 */
export enum DemoTypeEnum {
  TYPE_1 = 'TYPE_1',
  TYPE_2 = 'TYPE_2',
  TYPE_3 = 'TYPE_3',
}
/**
 * 类型值数组（可用于 mysqlEnum / 校验）
 */
export const demoTypes = Object.values(
  DemoTypeEnum,
) as NotEmptyArrayType<string>;
