import { FindManyByCursoredPaginationDto } from '@/app/api/common/dtos/find-many-by-cursored-pagination.dto';
import { FindManyByPaginationDto } from '@/app/api/common/dtos/find-many-by-pagination.dto';
import { zUtcDateTime } from '@/common/utils/zod/utc-date-time';
import { demoTypes } from '@/database/enums/demo-type.enum';
import { demosSchema } from '@/database/mysql/schemas';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * demos 表的可排序列名列表（运行时获取）
 */
const DEMO_ORDERABLE_COLUMNS = getTableConfig(demosSchema).columns.map(
  (col) => col.name,
) as [string, ...string[]];

/**
 * Demo 查询共用的字段 schema
 * 覆盖基类的 orderColumn 验证规则（限制为 demos 表的列名），并追加过滤条件字段
 */
const demoFilterFieldsSchema = z.object({
  /** 排序列，例如 'id' */
  orderColumn: z.enum(DEMO_ORDERABLE_COLUMNS).optional(),
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
  FindManyByPaginationDto.schema.extend(demoFilterFieldsSchema.shape),
) {}
