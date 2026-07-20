import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { CreateDemoRequestDto } from './create-demo-request.dto';

export class UpdateDemoRequestDto extends createZodDto(
  CreateDemoRequestDto.schema.partial(),
) {}
