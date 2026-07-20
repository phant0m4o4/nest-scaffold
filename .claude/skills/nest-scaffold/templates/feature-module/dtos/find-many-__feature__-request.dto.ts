import { FindManyByCursoredPaginationDto } from '@/app/api/common/dtos/find-many-by-cursored-pagination.dto';
import { __featuresCamel__Schema } from '@/database/mysql/schemas/__features__.schema';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

const __FEATURE___ORDERABLE_COLUMNS = getTableConfig(__featuresCamel__Schema).columns.map(
  (col) => col.name,
) as [string, ...string[]];

export class FindMany__Feature__ByCursoredPaginationRequestDto extends createZodDto(
  FindManyByCursoredPaginationDto.schema.extend({
    /** 排序列（限制为 __features__ 表的列名），例如 'id' */
    orderColumn: z.enum(__FEATURE___ORDERABLE_COLUMNS).optional(),
    /** 名称（模糊匹配），例如 'test' */
    name: z.string().optional(),

    // TODO: 按业务补充过滤字段（与服务层 _buildFilters 对应）
  }),
) {}
