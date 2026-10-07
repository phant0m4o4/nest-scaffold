import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

/**
 * 用户端路径参数：长码公开标识
 */
export class FindOneDemoByPublicIdParamDto extends createZodDto(
  z.object({
    /** 长码公开标识（nanoid），例如 'V1StGXR8_Z5jdHi6B-myT' */
    publicId: z.string().min(1),
  }),
) {}
