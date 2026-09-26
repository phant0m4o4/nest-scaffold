import { afterEach, describe, expect, it, vi } from 'vitest';

import randomString, { UN_CONFUSING_CHAR_PRESET } from '../random-string';

describe('randomString', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('默认字符集生成指定长度的字符串', () => {
    expect(randomString(32)).toMatch(/^[0-9a-zA-Z]{32}$/);
  });

  it('零长度允许空字符集并且不抽样', () => {
    const random = vi.spyOn(Math, 'random');
    expect(randomString(0, '', true)).toBe('');
    expect(random).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, -Infinity, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    '拒绝无效长度 %s',
    (length) => {
      expect(() => randomString(length)).toThrow(RangeError);
    },
  );

  it('非零长度拒绝空字符集', () => {
    expect(() => randomString(2, '')).toThrow(RangeError);
  });

  it('无重复模式拒绝超过唯一字符容量的长度', () => {
    expect(() => randomString(3, 'ab', true)).toThrow(RangeError);
    expect(() => randomString(2, 'aa', true)).toThrow(RangeError);
  });

  it('无重复模式按去重后的字符集抽样', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomString(2, 'aab', true)).toBe('ab');
  });

  it('允许重复模式保留字符集的重复权重', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(randomString(3, 'aab')).toBe('aaa');
  });

  it('自定义字符按 Unicode 码点处理，不拆分代理对', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomString(2, '😀好', true)).toBe('😀好');
    expect(randomString(2, '😀')).toBe('😀😀');
  });

  it('无重复模式支持用尽整个预设字符集', () => {
    const result = randomString(
      UN_CONFUSING_CHAR_PRESET.length,
      UN_CONFUSING_CHAR_PRESET,
      true,
    );
    expect(new Set(result).size).toBe(UN_CONFUSING_CHAR_PRESET.length);
    expect([...result].sort()).toEqual([...UN_CONFUSING_CHAR_PRESET].sort());
  });
});
