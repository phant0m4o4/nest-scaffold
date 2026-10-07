import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

export class FindManyByCursoredPaginationDto extends createZodDto(
  z.object({
    /** 加密游标（上一页 meta.nextCursor），缺省即第一页 */
    cursor: z.string().min(1).optional(),
    /** 每页条数（1-100），例如 30 */
    limit: z.coerce.number().int().positive().max(100).optional(),
    /**
     * 多列排序，例如 `createdAt:desc,id:desc`；缺省由服务端按 `id:desc`
     * 最后一列必须是 id（在 Service 中校验）
     */
    order: z.string().min(1).optional(),
  }),
) {}
