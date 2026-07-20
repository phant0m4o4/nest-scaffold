import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class FindManyByCursoredPaginationDto {
  /**
   * 分页游标，用于获取下一页数据
   * @example 10
   */
  @IsNumber()
  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value))
  cursor?: number;
  /**
   * 每页条数
   * @example 30
   */
  @IsNumber()
  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value))
  limit?: number;
  /**
   * 排序列
   * @example id
   */
  @IsString()
  @IsOptional()
  orderColumn?: string;
  /**
   * 排序方向
   * @example desc
   */
  @IsIn(['asc', 'desc'])
  @IsOptional()
  orderDirection?: string;
}
