import { describe, expect, it } from 'vitest';

import { generatePublicId, PUBLIC_ID_LENGTH } from '../public-id';

describe('generatePublicId', () => {
  it('默认长度应为 PUBLIC_ID_LENGTH', () => {
    expect(generatePublicId()).toHaveLength(PUBLIC_ID_LENGTH);
  });

  it('自定义长度应生效', () => {
    expect(generatePublicId(8)).toHaveLength(8);
  });

  it('应只包含 URL-safe 字符', () => {
    expect(generatePublicId()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
