import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';

class TestDto extends createZodDto(
  z.object({
    name: z.string().min(1),
    count: z.number().int().optional(),
  }),
) {}

describe('createZodDto', () => {
  it('create() 校验并剔除 schema 未声明的字段', () => {
    const actual = TestDto.create({ name: 'a', count: 2, extra: 'x' });

    expect(actual).toEqual({ name: 'a', count: 2 });
  });

  it('create() 对非法输入抛出 ZodError', () => {
    expect(() => TestDto.create({ name: '' })).toThrow(ZodError);
    expect(() => TestDto.create(undefined)).toThrow(ZodError);
  });

  it('静态契约：isZodDto 标记与 schema 暴露（全局管道与派生依赖此契约）', () => {
    expect(TestDto.isZodDto).toBe(true);
    expect(TestDto.schema.safeParse({ name: 'a' }).success).toBe(true);
  });

  it('schema 可 partial/extend 派生出新 DTO', () => {
    class PartialDto extends createZodDto(TestDto.schema.partial()) {}
    class ExtendedDto extends createZodDto(
      TestDto.schema.extend({ tag: z.string() }),
    ) {}

    expect(PartialDto.create({})).toEqual({});
    expect(ExtendedDto.create({ name: 'a', tag: 't' })).toEqual({
      name: 'a',
      tag: 't',
    });
  });
});
