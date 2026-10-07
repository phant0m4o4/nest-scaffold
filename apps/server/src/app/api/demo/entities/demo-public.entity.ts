import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { demoTypes } from '@/database/enums/demo-type.enum';
import { z } from 'zod';

/**
 * Demo 用户端响应实体（不包含 bigint id，避免泄露自增主键）
 */
export class DemoPublicEntity extends createZodDto(
  z.object({
    /** 长码公开标识（路径用），例如 'V1StGXR8_Z5jdHi6B-myT' */
    publicId: z.string(),
    /** 短码公开标识（推荐码等），例如 'xY7_k2Qm' */
    shortPublicId: z.string(),
    /** 名称，例如 'demo name' */
    name: z.string(),
    /** 类型，例如 'TYPE_1' */
    type: z.enum(demoTypes),
    /** 创建时间，例如 '2025-01-01 00:00:00' */
    createdAt: z.date(),
    /** 更新时间，例如 '2025-01-01 00:00:00' */
    updatedAt: z.date(),
  }),
) {}
