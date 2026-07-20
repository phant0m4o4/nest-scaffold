import { createZodDto } from 'nestjs-zod';
import { Create__Feature__RequestDto } from './create-__feature__-request.dto';

export class Update__Feature__RequestDto extends createZodDto(
  Create__Feature__RequestDto.schema.partial(),
  // TODO: 需要追加仅更新用的字段时使用 .extend({...})
) {}
