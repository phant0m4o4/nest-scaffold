import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { z } from 'zod';

/**
 * 仅返回长码的响应实体（字段名 `publicId` 为通用占位）
 *
 * 用户端创建资源时使用，避免把 bigint 自增主键泄露给前端。
 * 业务若长码列不叫 `publicId`（如 `accessKey`），应自建同构 Entity，勿硬套本类字段名。
 * 短码不放在创建响应里；需要时见列表/详情的 `*PublicEntity`。
 */
export class OnlyPublicIdEntity extends createZodDto(
  z.object({
    /** 长码（占位字段名；业务可换语义名自建 Entity） */
    publicId: z.string().min(1),
  }),
) {}
