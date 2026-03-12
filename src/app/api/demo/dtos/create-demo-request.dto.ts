import { DtoSchema } from '@/common/decorators/swagger/dto-schema.decorator';
import { demoTypes } from '@/database/enums/demo-type.enum';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

@DtoSchema({ name: 'app.api.demo.dtos.create-demo-request.dto' })
export class CreateDemoRequestDto {
  /**
   * 名称
   * @example 'demo name'
   */
  @IsString()
  @IsNotEmpty()
  name: string;
  /**
   * 类型
   * @example 'TYPE_1'
   */
  @IsIn(demoTypes)
  @IsNotEmpty()
  type: string;
  /**
   * 父级ID
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  parentId?: number;
}
