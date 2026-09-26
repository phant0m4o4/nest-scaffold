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

  it('非字符串输入校验失败', () => {
    expect(zUtcDateTime.safeParse(123).success).toBe(false);
    expect(zUtcDateTime.safeParse(null).success).toBe(false);
  });
});
