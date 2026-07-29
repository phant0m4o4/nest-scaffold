import { FindManyByCursoredPaginationDto } from '@/app/api/common/dtos/find-many-by-cursored-pagination.dto';
import { FindManyByPaginationDto } from '@/app/api/common/dtos/find-many-by-pagination.dto';
import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { __featuresCamel__Schema } from '@/database/mysql/schemas/__features__.schema';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { z } from 'zod';

export const __FEATURE___ORDERABLE_COLUMNS = getTableConfig(
  __featuresCamel__Schema,
).columns.map((col) => col.name) as [string, ...string[]];

const __feature__FilterFieldsSchema = z.object({
  /** 名称（模糊匹配），例如 'test' */
  name: z.string().optional(),
  // TODO: 按业务补充过滤字段（与服务层 _buildFilters 对应）
});

export class FindMany__Feature__ByCursoredPaginationRequestDto extends createZodDto(
  FindManyByCursoredPaginationDto.schema.extend(
    __feature__FilterFieldsSchema.shape,
  ),
) {}

export class FindMany__Feature__ByPaginationRequestDto extends createZodDto(
  FindManyByPaginationDto.schema
    .extend(__feature__FilterFieldsSchema.shape)
    .extend({
      orderColumn: z.enum(__FEATURE___ORDERABLE_COLUMNS).optional(),
    }),
) {}
