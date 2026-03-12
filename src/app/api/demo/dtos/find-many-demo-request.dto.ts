import { FindManyByCursoredPaginationDto } from '@/app/api/common/dtos/find-many-by-cursored-pagination.dto';
import { FindManyByPaginationDto } from '@/app/api/common/dtos/find-many-by-pagination.dto';
import { DtoSchema } from '@/common/decorators/swagger/dto-schema.decorator';
import { UTC } from '@/common/utils/date-time';
import { demoTypes } from '@/database/enums/demo-type.enum';
import { demosSchema } from '@/database/schemas';
import { Transform } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString } from 'class-validator';
import { getTableConfig } from 'drizzle-orm/mysql-core';

/**
 * demos 表的可排序列名列表（运行时获取）
 */
const DEMO_ORDERABLE_COLUMNS = getTableConfig(demosSchema).columns.map(
  (col) => col.name,
);

/**
 * Demo 公共过滤字段接口
 * 定义所有 Demo 查询共用的过滤条件字段，确保类型一致性
 */
interface IDemoFilterFields {
  name?: string;
  type?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  updatedAtFrom?: Date;
  updatedAtTo?: Date;
}

@DtoSchema({
  name: 'app.api.demo.dtos.find-many-demo-request.dto.find-many-demo-by-cursored-pagination-request',
})
export class FindManyDemoByCursoredPaginationRequestDto
  extends FindManyByCursoredPaginationDto
  implements IDemoFilterFields
{
  /**
   * 排序列（覆盖基类验证规则，限制为 demos 表的列名）
   * @example 'id'
   */
  @IsIn(DEMO_ORDERABLE_COLUMNS)
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
  /**
   * 类型
   * @example 'TYPE_1'
   */
  @IsIn(demoTypes)
  @IsOptional()
  type?: string;
  /**
   * 创建时间从
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsOptional()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  createdAtFrom?: Date;
  /**
   * 创建时间到
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsOptional()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  createdAtTo?: Date;
  /**
   * 更新时间从
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsOptional()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  updatedAtFrom?: Date;
  /**
   * 更新时间到
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsOptional()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  updatedAtTo?: Date;
}

@DtoSchema({
  name: 'app.api.demo.dto.find-many-demo-request.dto.find-many-demo-by-pagination-request',
})
export class FindManyDemoByPaginationRequestDto
  extends FindManyByPaginationDto
  implements IDemoFilterFields
{
  /**
   * 排序列（覆盖基类验证规则，限制为 demos 表的列名）
   * @example 'id'
   */
  @IsIn(DEMO_ORDERABLE_COLUMNS)
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
  /**
   * 类型
   * @example 'TYPE_1'
   */
  @IsIn(demoTypes)
  @IsOptional()
  type?: string;
  /**
   * 创建时间从
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsOptional()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  createdAtFrom?: Date;
  /**
   * 创建时间到
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsOptional()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  createdAtTo?: Date;
  /**
   * 更新时间从
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsOptional()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  updatedAtFrom?: Date;
  /**
   * 更新时间到
   * @example '2025-01-01 00:00:00'
   */
  @IsDate()
  @IsOptional()
  @Transform(({ value }: { value: string }) => UTC(value).toDate())
  updatedAtTo?: Date;
}
