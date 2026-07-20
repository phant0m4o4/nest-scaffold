import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class Create__Feature__RequestDto extends createZodDto(
  z.object({
    /** 名称，例如 '示例名称' */
    name: z.string().min(1),

    // TODO: 按业务补充字段，配合 zod schema
  }),
) {}
