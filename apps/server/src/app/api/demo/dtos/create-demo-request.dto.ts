import { demoTypes } from '@/database/enums/demo-type.enum';
import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

export class CreateDemoRequestDto extends createZodDto(
  z.object({
    /** 名称，例如 'demo name' */
    name: z.string().trim().min(1).max(100),
    /** 类型，例如 'TYPE_1' */
    type: z.enum(demoTypes),
    /** 父级 ID；null 表示不关联父级 */
    parentId: z.number().int().positive().nullable().optional(),
  }),
) {}
