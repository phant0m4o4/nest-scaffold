import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

/**
 * 仅返回长码公开标识的响应实体
 *
 * 用户端创建资源时使用，避免把 bigint 自增主键泄露给前端。
 * 短码（推荐码）不放在创建响应里；需要时见列表/详情的 `*PublicEntity`。
 */
export class OnlyPublicIdEntity extends createZodDto(
  z.object({
    /** 长码公开标识（nanoid），例如 'V1StGXR8_Z5jdHi6B-myT' */
    publicId: z.string().min(1),
  }),
) {}
