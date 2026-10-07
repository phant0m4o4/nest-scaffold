import { describe, expect, it } from 'vitest';
import { CreateDemoRequestDto } from '../create-demo-request.dto';

describe('CreateDemoRequestDto', () => {
  it('名称去除首尾空白，并允许显式清空父级', () => {
    expect(
      CreateDemoRequestDto.schema.parse({
        name: '  示例  ',
        type: 'TYPE_1',
        parentId: null,
      }),
    ).toEqual({ name: '示例', type: 'TYPE_1', parentId: null });
  });

  it.each(['', '   ', 'a'.repeat(101)])('拒绝无效名称 %j', (name) => {
    expect(
      CreateDemoRequestDto.schema.safeParse({ name, type: 'TYPE_1' }).success,
    ).toBe(false);
  });

  it('接受数据库名称长度上限', () => {
    expect(
      CreateDemoRequestDto.schema.safeParse({
        name: 'a'.repeat(100),
        type: 'TYPE_3',
      }).success,
    ).toBe(true);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'])(
    '父级 ID %j 必须是正安全整数',
    (parentId) => {
      expect(
        CreateDemoRequestDto.schema.safeParse({
          name: '示例',
          type: 'TYPE_1',
          parentId,
        }).success,
      ).toBe(false);
    },
  );

  it('拒绝未声明的 Demo 类型', () => {
    expect(
      CreateDemoRequestDto.schema.safeParse({ name: '示例', type: 'other' })
        .success,
    ).toBe(false);
  });
});
