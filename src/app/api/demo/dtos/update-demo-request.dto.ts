import { UTC } from '@/common/utils/date-time';
import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsDate, IsNotEmpty } from 'class-validator';
import { CreateDemoRequestDto } from './create-demo-request.dto';

export class UpdateDemoRequestDto extends PartialType(CreateDemoRequestDto) {
  /**
   * 创建时间
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  createdAt: Date;
  /**
   * 更新时间
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  updatedAt: Date;
}
