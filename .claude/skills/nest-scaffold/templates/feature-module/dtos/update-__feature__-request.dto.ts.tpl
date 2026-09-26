import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { Create__Feature__RequestDto } from './create-__feature__-request.dto';

export class Update__Feature__RequestDto extends createZodDto(
  Create__Feature__RequestDto.schema
    .partial()
    // TODO: 需要追加仅更新用的字段时，在非空校验之前使用 .extend({...})
    .refine((value) => Object.keys(value).length > 0, {
      message: '至少提供一个可更新字段',
    }),
) {}
