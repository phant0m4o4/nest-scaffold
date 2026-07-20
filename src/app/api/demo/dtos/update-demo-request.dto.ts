import { zUtcDateTime } from '@/common/utils/zod/utc-date-time';
import { createZodDto } from 'nestjs-zod';
import { CreateDemoRequestDto } from './create-demo-request.dto';

export class UpdateDemoRequestDto extends createZodDto(
  CreateDemoRequestDto.schema.partial().extend({
    /** 创建时间，例如 '2025-01-01 00:00:00' */
    createdAt: zUtcDateTime,
    /** 更新时间，例如 '2025-01-01 00:00:00' */
    updatedAt: zUtcDateTime,
  }),
) {}
