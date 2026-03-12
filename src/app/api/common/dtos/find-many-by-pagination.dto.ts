import { DtoSchema } from '@/common/decorators/swagger/dto-schema.decorator';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

@DtoSchema({ name: 'app.api.common.dtos.find-many-by-pagination.dto' })
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
