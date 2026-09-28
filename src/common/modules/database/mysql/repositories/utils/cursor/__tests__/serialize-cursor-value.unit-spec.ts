import { describe, expect, it } from 'vitest';

import {
  coerceCursorValueForQuery,
  serializeCursorValue,
} from '../serialize-cursor-value';

describe('serializeCursorValue', () => {
  it('应当序列化 number / string / Date / bigint', () => {
    expect(serializeCursorValue(12)).toBe(12);
    expect(serializeCursorValue('abc')).toBe('abc');
    expect(serializeCursorValue(new Date('2026-01-01T00:00:00.000Z'))).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(serializeCursorValue(10n)).toBe(10);
  });

  it('null / undefined 应拒绝（Error，非 400）', () => {
    expect(() => serializeCursorValue(null)).toThrow(Error);
    expect(() => serializeCursorValue(undefined)).toThrow(Error);
  });

  it('不支持的类型应拒绝', () => {
    expect(() => serializeCursorValue({ a: 1 })).toThrow(Error);
  });

  it.each([Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1.25, -0.125])(
    '合法安全整数或非整数排序值应保持不变：%s',
    (value) => {
      expect(serializeCursorValue(value)).toBe(value);
    },
  );

  it.each([BigInt(Number.MIN_SAFE_INTEGER), BigInt(Number.MAX_SAFE_INTEGER)])(
    '安全范围内的 bigint 边界仍应兼容 number 游标：%s',
    (value) => {
      expect(serializeCursorValue(value)).toBe(Number(value));
    },
  );

  it.each([
    9007199254740992n,
    9007199254740993n,
    -9007199254740992n,
    -9007199254740993n,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1,
  ])('不安全整数应明确拒绝，不能使不同值生成同一游标：%s', (value) => {
    expect(() => serializeCursorValue(value)).toThrow(/安全/);
  });
});

describe('coerceCursorValueForQuery', () => {
  it('number 应原样返回', () => {
    expect(coerceCursorValueForQuery(7, 'number')).toBe(7);
  });

  it('日期列的 ISO 字符串应转为 Date', () => {
    const actual = coerceCursorValueForQuery(
      '2026-07-01T12:00:00.000Z',
      'date',
    );
    expect(actual).toBeInstanceOf(Date);
    expect((actual as Date).toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('普通字符串不应被当成日期', () => {
    expect(coerceCursorValueForQuery('TYPE_1', 'string')).toBe('TYPE_1');
  });

  it('字符串列的 ISO 日期应保留原值', () => {
    const value = '2026-07-01T12:00:00.000Z';
    expect(coerceCursorValueForQuery(value, 'string')).toBe(value);
  });
});
