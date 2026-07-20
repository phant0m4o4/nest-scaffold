import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class FindManyByPaginationDto extends createZodDto(
  z.object({
    /** 页码，例如 1 */
    page: z.coerce.number().int().optional(),
    /** 每页条数，例如 30 */
    pageSize: z.coerce.number().int().optional(),
    /** 排序列，例如 id */
    orderColumn: z.string().optional(),
    /** 排序方向，例如 desc */
    orderDirection: z.enum(['asc', 'desc']).optional(),
  }),
) {}
