import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

export class __Feature__Entity extends createZodDto(
  z.object({
    /** 主键，例如 1 */
    id: z.number(),
    /** 名称，例如 '示例名称' */
    name: z.string(),
    /** 创建时间，例如 '2025-01-01 00:00:00' */
    createdAt: z.date(),
    /** 更新时间，例如 '2025-01-01 00:00:00' */
    updatedAt: z.date(),
  }),
) {}
