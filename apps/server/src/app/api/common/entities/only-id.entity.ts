import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

/**
 * 仅返回内部主键的响应实体
 *
 * 管理端创建资源时使用。用户端请用 `OnlyPublicIdEntity`，避免泄露自增 id。
 */
export class OnlyIdEntity extends createZodDto(
  z.object({
    /** 内部主键（bigint） */
    id: z.number(),
  }),
) {}
