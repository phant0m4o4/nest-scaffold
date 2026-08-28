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
});

describe('coerceCursorValueForQuery', () => {
  it('number 应原样返回', () => {
    expect(coerceCursorValueForQuery(7)).toBe(7);
  });

  it('ISO 日期字符串应转为 Date', () => {
    const actual = coerceCursorValueForQuery('2026-07-01T12:00:00.000Z');
    expect(actual).toBeInstanceOf(Date);
    expect((actual as Date).toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('普通字符串不应被当成日期', () => {
    expect(coerceCursorValueForQuery('TYPE_1')).toBe('TYPE_1');
  });
});
