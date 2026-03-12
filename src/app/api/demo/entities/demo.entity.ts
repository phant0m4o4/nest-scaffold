import { DtoSchema } from '@/common/decorators/swagger/dto-schema.decorator';
import { Expose } from 'class-transformer';

@DtoSchema({ name: 'app.api.demo.entities.demo.entity' })
export class DemoEntity {
  /**
   * 主键
   * @example 1
   */
  @Expose()
  id: number;
  /**
   * 名称
   * @example 'demo name'
   */
  @Expose()
  name: string;
  /**
   * 类型
   * @example 'TYPE_1'
   */
  @Expose()
  type: string;
  /**
   * 父级ID
   * @example 1
   */
  @Expose()
  parentId: number;
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
