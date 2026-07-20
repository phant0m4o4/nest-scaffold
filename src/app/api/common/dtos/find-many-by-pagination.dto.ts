import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class FindManyByPaginationDto {
  /**
   * 页码
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  page?: number;
  /**
   * 每页条数
   * @example 30
   */
  @IsNumber()
  @IsOptional()
  /**
   * 每页条数
   * @example 30
   */
  pageSize?: number;
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
