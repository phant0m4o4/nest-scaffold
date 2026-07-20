import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

export class FindOneDemoParamDto extends createZodDto(
  z.object({
    /** 主键，例如 1 */
    id: z.coerce.number().int().positive(),
  }),
) {}
