import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class OnlyIdEntity extends createZodDto(
  z.object({
    /** 主键 */
    id: z.number(),
  }),
) {}
