import { describe, expect, it } from 'vitest';

import { optionalEnvInt } from '../optional-env-int';

describe('optionalEnvInt', () => {
  it('空串与空白串应解析为 undefined（锚点变量缺失时 ${...} 展开为空串）', () => {
    expect(optionalEnvInt().parse('')).toBeUndefined();
    expect(optionalEnvInt().parse('   ')).toBeUndefined();
  });

  it('未设置时应解析为 undefined', () => {
    expect(optionalEnvInt().parse(undefined)).toBeUndefined();
  });

  it('数字字符串应强转为整数', () => {
    expect(optionalEnvInt().parse('6379')).toBe(6379);
    expect(optionalEnvInt().parse('0')).toBe(0);
  });

  it('低于下限的值应校验失败（如端口最小为 1）', () => {
    expect(optionalEnvInt(1).safeParse('0').success).toBe(false);
  });

  it('非数字与小数应校验失败', () => {
    expect(optionalEnvInt().safeParse('abc').success).toBe(false);
    expect(optionalEnvInt().safeParse('1.5').success).toBe(false);
  });
});
