import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { isSameOrderDeclaration, parseOrderQuery } from '../parse-order';

const ALLOWED = ['id', 'createdAt', 'name'] as const;

describe('parseOrderQuery', () => {
  it('缺省应为 id:desc', () => {
    expect(parseOrderQuery(undefined, ALLOWED)).toEqual([
      { column: 'id', direction: 'desc' },
    ]);
  });

  it('应解析多列 order', () => {
    expect(parseOrderQuery('createdAt:desc,id:desc', ALLOWED)).toEqual([
      { column: 'createdAt', direction: 'desc' },
      { column: 'id', direction: 'desc' },
    ]);
  });

  it('最后一列非 id 应拒绝', () => {
    expect(() => parseOrderQuery('createdAt:desc', ALLOWED)).toThrow(
      BadRequestException,
    );
  });

  it('非法列名应拒绝', () => {
    expect(() => parseOrderQuery('foo:asc,id:desc', ALLOWED)).toThrow(
      BadRequestException,
    );
  });

  it('重复列名应拒绝', () => {
    expect(() => parseOrderQuery('id:desc,id:asc', ALLOWED)).toThrow(
      BadRequestException,
    );
  });
});

describe('isSameOrderDeclaration', () => {
  it('column/direction 一致时应为 true', () => {
    expect(
      isSameOrderDeclaration(
        [
          { column: 'createdAt', direction: 'desc' },
          { column: 'id', direction: 'desc' },
        ],
        [
          { column: 'createdAt', direction: 'desc' },
          { column: 'id', direction: 'desc' },
        ],
      ),
    ).toBe(true);
  });

  it('不一致时应为 false', () => {
    expect(
      isSameOrderDeclaration(
        [{ column: 'id', direction: 'desc' }],
        [{ column: 'id', direction: 'asc' }],
      ),
    ).toBe(false);
  });
});
