import { DtoSchema } from '@/common/decorators/swagger/dto-schema.decorator';
import { IsNotEmpty, IsString } from 'class-validator';

@DtoSchema({ name: 'app.api.__features__.dtos.create-__feature__-request.dto' })
export class Create__Feature__RequestDto {
  /**
   * 名称
   * @example '示例名称'
   */
  @IsString()
  @IsNotEmpty()
  name: string;

  // TODO: 按业务补充字段，配合 class-validator 装饰器
}
