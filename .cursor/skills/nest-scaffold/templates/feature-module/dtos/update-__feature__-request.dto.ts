import { DtoSchema } from '@/common/decorators/swagger/dto-schema.decorator';
import { IsOptional, IsString } from 'class-validator';

@DtoSchema({ name: 'app.api.__features__.dtos.update-__feature__-request.dto' })
export class Update__Feature__RequestDto {
  /**
   * 名称
   * @example '示例名称'
   */
  @IsString()
  @IsOptional()
  name?: string;

  // TODO: 按业务补充字段
}
