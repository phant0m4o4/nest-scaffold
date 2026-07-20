import { IsNotEmpty, IsString } from 'class-validator';

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
