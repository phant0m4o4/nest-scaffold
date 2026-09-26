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
});
