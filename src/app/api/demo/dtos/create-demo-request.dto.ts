import { demoTypes } from '@/database/enums/demo-type.enum';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CreateDemoRequestDto extends createZodDto(
  z.object({
    /** 名称，例如 'demo name' */
    name: z.string().min(1),
    /** 类型，例如 'TYPE_1' */
    type: z.enum(demoTypes),
    /** 父级ID，例如 1 */
    parentId: z.number().int().optional(),
  }),
) {}
