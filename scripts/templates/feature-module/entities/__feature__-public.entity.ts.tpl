import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

/** 用户端响应实体（无 bigint id） */
export class __Feature__PublicEntity extends createZodDto(
  z.object({
    /** 长码公开标识（路径用） */
    publicId: z.string(),
    /** 短码公开标识（推荐码等） */
    shortPublicId: z.string(),
    /** 名称，例如 '示例名称' */
    name: z.string(),
    /** 创建时间 */
    createdAt: z.date(),
    /** 更新时间 */
    updatedAt: z.date(),
  }),
) {}
