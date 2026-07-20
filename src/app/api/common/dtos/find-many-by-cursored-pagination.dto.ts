import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class FindManyByCursoredPaginationDto extends createZodDto(
  z.object({
    /** 分页游标，用于获取下一页数据，例如 10 */
    cursor: z.coerce.number().int().optional(),
    /** 每页条数，例如 30 */
    limit: z.coerce.number().int().optional(),
    /** 排序列，例如 id */
    orderColumn: z.string().optional(),
    /** 排序方向，例如 desc */
    orderDirection: z.enum(['asc', 'desc']).optional(),
  }),
) {}
