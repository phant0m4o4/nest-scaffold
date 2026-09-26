import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { CreateDemoRequestDto } from './create-demo-request.dto';

export class UpdateDemoRequestDto extends createZodDto(
  CreateDemoRequestDto.schema
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
      message: '至少提供一个可更新字段',
    }),
) {}
