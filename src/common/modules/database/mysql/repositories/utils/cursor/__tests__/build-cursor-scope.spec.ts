import { describe, expect, it } from 'vitest';

import {
  buildCursorScope,
  canonicalizeFilterForScope,
} from '../build-cursor-scope';

describe('buildCursorScope', () => {
  it('相同筛选（键序不同）应得到相同 scope', () => {
    const a = buildCursorScope('demo.list', { b: 1, a: 'x' });
    const b = buildCursorScope('demo.list', { a: 'x', b: 1 });
    expect(a).toBe(b);
    expect(a.startsWith('demo.list:')).toBe(true);
  });

  it('筛选变化应改变 scope', () => {
    const a = buildCursorScope('demo.list', { name: 'a' });
    const b = buildCursorScope('demo.list', { name: 'b' });
    expect(a).not.toBe(b);
  });

  it('Date 应稳定序列化为 ISO', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(canonicalizeFilterForScope({ createdAtFrom: date })).toBe(
      JSON.stringify({ createdAtFrom: '2026-01-01T00:00:00.000Z' }),
    );
  });

  it('不同 resourceKey 应不同', () => {
    const filter = { name: 'x' };
    expect(buildCursorScope('demo.list', filter)).not.toBe(
      buildCursorScope('admin.demo.list', filter),
    );
  });

  it('空串 / null 筛选应与未传筛选等价', () => {
    const empty = buildCursorScope('demo.list', {});
    expect(buildCursorScope('demo.list', { name: '' })).toBe(empty);
    expect(buildCursorScope('demo.list', { name: '   ' })).toBe(empty);
    expect(buildCursorScope('demo.list', { name: null })).toBe(empty);
  });
});
