import { DtoSchema } from '@/common/decorators/swagger/dto-schema.decorator';
import { Expose } from 'class-transformer';
@DtoSchema({ name: 'app.api.common.only-id.entity' })
export class OnlyIdEntity {
  /**
   * 主键
   */
  @Expose()
  id: number;
}
