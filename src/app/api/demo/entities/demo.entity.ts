import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class DemoEntity extends createZodDto(
  z.object({
    /** 主键，例如 1 */
    id: z.number(),
    /** 名称，例如 'demo name' */
    name: z.string(),
    /** 类型，例如 'TYPE_1' */
    type: z.string(),
    /** 父级ID，例如 1 */
    parentId: z.number().nullable(),
    /** 创建时间，例如 '2025-01-01 00:00:00' */
    createdAt: z.date(),
    /** 更新时间，例如 '2025-01-01 00:00:00' */
    updatedAt: z.date(),
  }),
) {}
