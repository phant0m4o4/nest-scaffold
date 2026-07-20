import { Expose } from 'class-transformer';

export class __Feature__Entity {
  /**
   * 主键
   * @example 1
   */
  @Expose()
  id: number;

  /**
   * 名称
   * @example '示例名称'
   */
  @Expose()
  name: string;

  /**
   * 创建时间
   * @example '2025-01-01 00:00:00'
   */
  @Expose()
  createdAt: Date;

  /**
   * 更新时间
   * @example '2025-01-01 00:00:00'
   */
  @Expose()
  updatedAt: Date;
}
