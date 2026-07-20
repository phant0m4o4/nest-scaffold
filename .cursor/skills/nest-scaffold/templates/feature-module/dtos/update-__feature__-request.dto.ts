import { IsOptional, IsString } from 'class-validator';

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
