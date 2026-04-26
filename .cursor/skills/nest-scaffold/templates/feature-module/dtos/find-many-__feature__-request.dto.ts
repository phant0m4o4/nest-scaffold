import { FindManyByCursoredPaginationDto } from '@/app/api/common/dtos/find-many-by-cursored-pagination.dto';
import { DtoSchema } from '@/common/decorators/swagger/dto-schema.decorator';
import { __featuresCamel__Schema } from '@/database/schemas/__features__.schema';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { getTableConfig } from 'drizzle-orm/mysql-core';

const __FEATURE___ORDERABLE_COLUMNS = getTableConfig(__featuresCamel__Schema).columns.map(
  (col) => col.name,
);

@DtoSchema({
  name: 'app.api.__features__.dtos.find-many-__feature__-request.dto.find-many-__feature__-by-cursored-pagination-request',
})
export class FindMany__Feature__ByCursoredPaginationRequestDto extends FindManyByCursoredPaginationDto {
  /**
   * 排序列（限制为 __features__ 表的列名）
   * @example 'id'
   */
  @IsIn(__FEATURE___ORDERABLE_COLUMNS)
  @IsString()
  @IsOptional()
  declare orderColumn?: string;

  /**
   * 名称（模糊匹配）
   * @example 'test'
   */
  @IsString()
  @IsOptional()
  name?: string;

  // TODO: 按业务补充过滤字段（与服务层 _buildFilters 对应）
}
