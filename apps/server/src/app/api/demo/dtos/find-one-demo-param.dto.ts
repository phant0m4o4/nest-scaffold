import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

/**
 * 管理端路径参数：内部 bigint 主键
 *
 * 用户端请用 `FindOneDemoByPublicIdParamDto`，避免暴露自增 id。
 */
export class FindOneDemoParamDto extends createZodDto(
  z.object({
    /** 内部主键，例如 1 */
    id: z.coerce.number().int().positive(),
  }),
) {}
