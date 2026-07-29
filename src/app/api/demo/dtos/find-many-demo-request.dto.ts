import { FindManyByCursoredPaginationDto } from '@/app/api/common/dtos/find-many-by-cursored-pagination.dto';
import { FindManyByPaginationDto } from '@/app/api/common/dtos/find-many-by-pagination.dto';
import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { zUtcDateTime } from '@/common/utils/zod/utc-date-time';
import { demoTypes } from '@/database/enums/demo-type.enum';
import { demosSchema } from '@/database/mysql/schemas';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { z } from 'zod';

/**
 * demos 表的可排序列名列表（运行时获取）
 */
export const DEMO_ORDERABLE_COLUMNS = getTableConfig(demosSchema).columns.map(
  (col) => col.name,
) as [string, ...string[]];

/**
 * Demo 查询共用的筛选字段（不含排序；游标用 order，页码用 orderColumn）
 */
const demoFilterFieldsSchema = z.object({
  /** 名称（模糊匹配），例如 'test' */
  name: z.string().optional(),
  /** 类型，例如 'TYPE_1' */
  type: z.enum(demoTypes).optional(),
  /** 创建时间从，例如 '2025-01-01 00:00:00' */
  createdAtFrom: zUtcDateTime.optional(),
  /** 创建时间到，例如 '2025-01-01 00:00:00' */
  createdAtTo: zUtcDateTime.optional(),
  /** 更新时间从，例如 '2025-01-01 00:00:00' */
  updatedAtFrom: zUtcDateTime.optional(),
  /** 更新时间到，例如 '2025-01-01 00:00:00' */
  updatedAtTo: zUtcDateTime.optional(),
});

export class FindManyDemoByCursoredPaginationRequestDto extends createZodDto(
  FindManyByCursoredPaginationDto.schema.extend(demoFilterFieldsSchema.shape),
) {}

export class FindManyDemoByPaginationRequestDto extends createZodDto(
  FindManyByPaginationDto.schema.extend(demoFilterFieldsSchema.shape).extend({
    /** 排序列，例如 'id'（页码分页仍为单列） */
    orderColumn: z.enum(DEMO_ORDERABLE_COLUMNS).optional(),
  }),
) {}
