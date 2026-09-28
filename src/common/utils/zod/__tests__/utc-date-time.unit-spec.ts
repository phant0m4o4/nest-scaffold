import { zUtcDateTime } from '@/common/utils/zod/utc-date-time';
import { describe, expect, it } from 'vitest';

describe('zUtcDateTime', () => {
  it('合法字符串按 UTC 解析为 Date（与本地时区无关）', () => {
    const actual = zUtcDateTime.parse('2025-01-01 00:00:00');

    expect(actual).toBeInstanceOf(Date);
    expect(actual.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('非法日期字符串校验失败', () => {
    expect(zUtcDateTime.safeParse('not-a-date').success).toBe(false);
  });

  it.each([
    ['2024-02-29 23:59:59', '2024-02-29T23:59:59.000Z'],
    ['2000-02-29 00:00:00', '2000-02-29T00:00:00.000Z'],
    ['2025-12-31 23:59:59', '2025-12-31T23:59:59.000Z'],
  ])('合法日历边界应按 UTC 解析：%s', (input, expected) => {
    expect(zUtcDateTime.parse(input).toISOString()).toBe(expected);
  });

  it.each([
    '2025-02-29 00:00:00',
    '1900-02-29 00:00:00',
    '2025-02-31 12:00:00',
    '2025-04-31 00:00:00',
    '2025-00-01 00:00:00',
    '2025-13-01 00:00:00',
    '2025-01-00 00:00:00',
    '2025-01-32 00:00:00',
    '2025-01-01 24:00:00',
    '2025-01-01 12:60:00',
    '2025-01-01 12:00:60',
  ])('非法日期时间不得自动进位：%s', (input) => {
    expect(zUtcDateTime.safeParse(input).success).toBe(false);
  });

  it.each([
    '2025-1-1 00:00:00',
    '2025-01-01',
    '2025/01/01 00:00:00',
    '2025-01-01 00:00',
    ' 2025-01-01 00:00:00 ',
  ])('不符合约定格式的字符串校验失败：%s', (input) => {
    expect(zUtcDateTime.safeParse(input).success).toBe(false);
  });

  it('非字符串输入校验失败', () => {
    expect(zUtcDateTime.safeParse(123).success).toBe(false);
    expect(zUtcDateTime.safeParse(null).success).toBe(false);
  });
});
