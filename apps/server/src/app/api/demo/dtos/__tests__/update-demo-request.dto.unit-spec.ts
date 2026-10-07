import { describe, expect, it } from 'vitest';

import { UpdateDemoRequestDto } from '../update-demo-request.dto';

describe('UpdateDemoRequestDto', () => {
  it('应拒绝空更新对象', () => {
    const result = UpdateDemoRequestDto.schema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('至少包含一个合法字段时应通过', () => {
    const result = UpdateDemoRequestDto.schema.safeParse({ name: 'updated' });

    expect(result.success).toBe(true);
  });

  it('允许仅清空父级关联', () => {
    expect(UpdateDemoRequestDto.schema.parse({ parentId: null })).toEqual({
      parentId: null,
    });
  });

  it('剔除未知字段后为空仍应拒绝', () => {
    expect(
      UpdateDemoRequestDto.schema.safeParse({ unrelated: 'value' }).success,
    ).toBe(false);
  });

  it('只提供 undefined 字段也应拒绝', () => {
    expect(
      UpdateDemoRequestDto.schema.safeParse({ name: undefined }).success,
    ).toBe(false);
  });

  it.each([{ name: '   ' }, { name: 'a'.repeat(101) }, { parentId: -1 }])(
    '更新也应校验字段 %j',
    (body) => {
      expect(UpdateDemoRequestDto.schema.safeParse(body).success).toBe(false);
    },
  );
});
