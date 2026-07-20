import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

export class OnlyIdEntity extends createZodDto(
  z.object({
    /** 主键 */
    id: z.number(),
  }),
) {}
