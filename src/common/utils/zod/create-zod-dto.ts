import { z } from 'zod';

/**
 * zod DTO 类的静态结构
 */
export interface IZodDtoClass<TSchema extends z.ZodType = z.ZodType> {
  new (): z.output<TSchema>;
  readonly isZodDto: true;
  readonly schema: TSchema;
  /** 校验并净化输入（剔除 schema 未声明的字段），失败抛 ZodError */
  create(input: unknown): z.output<TSchema>;
}

/**
 * 由 zod schema 生成 NestJS DTO 类
 *
 * 类型与校验的单一来源：类实例类型即 `z.output<TSchema>`；
 * 静态成员暴露 `schema`（供 `.extend()` / `.partial()` 派生）与 `create()`（响应净化）。
 * 全局 `I18nZodValidationPipe` 通过静态标记 `isZodDto` 识别并自动校验。
 *
 * @example
 * ```typescript
 * export class CreateDemoRequestDto extends createZodDto(
 *   z.object({ name: z.string().min(1) }),
 * ) {}
 * ```
 */
export function createZodDto<TSchema extends z.ZodType>(
  schema: TSchema,
): IZodDtoClass<TSchema> {
  class ZodDto {
    static readonly isZodDto = true as const;
    static readonly schema = schema;
    static create(input: unknown): z.output<TSchema> {
      return schema.parse(input) as z.output<TSchema>;
    }
  }
  return ZodDto as unknown as IZodDtoClass<TSchema>;
}
