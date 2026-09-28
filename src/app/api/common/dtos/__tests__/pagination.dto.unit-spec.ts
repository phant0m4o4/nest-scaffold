import { FindManyByCursoredPaginationDto } from '@/app/api/common/dtos/find-many-by-cursored-pagination.dto';
import { FindManyByPaginationDto } from '@/app/api/common/dtos/find-many-by-pagination.dto';
import { describe, expect, it } from 'vitest';

describe('分页 DTO 边界', () => {
  it('cursored：limit 接受 1-100（含字符串强转），越界与非法值拒绝', () => {
    const schema = FindManyByCursoredPaginationDto.schema;

    expect(schema.parse({ limit: '30' }).limit).toBe(30);
    expect(schema.parse({ limit: '100' }).limit).toBe(100);
    expect(schema.safeParse({ limit: '0' }).success).toBe(false);
    expect(schema.safeParse({ limit: '101' }).success).toBe(false);
    expect(schema.safeParse({ limit: 'abc' }).success).toBe(false);
    expect(schema.safeParse({ limit: '2.5' }).success).toBe(false);
  });

  it('cursored：cursor 为非空字符串密文', () => {
    const schema = FindManyByCursoredPaginationDto.schema;

    expect(schema.parse({ cursor: 'iv.tag.cipher' }).cursor).toBe(
      'iv.tag.cipher',
    );
    expect(schema.safeParse({ cursor: '' }).success).toBe(false);
  });

  it('cursored：order 为非空字符串', () => {
    const schema = FindManyByCursoredPaginationDto.schema;

    expect(schema.parse({ order: 'createdAt:desc,id:desc' }).order).toBe(
      'createdAt:desc,id:desc',
    );
    expect(schema.safeParse({ order: '' }).success).toBe(false);
  });

  it('pagination：page/pageSize 边界与 cursored 一致', () => {
    const schema = FindManyByPaginationDto.schema;

    expect(schema.parse({ page: '1', pageSize: '100' })).toEqual({
      page: 1,
      pageSize: 100,
    });
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
    expect(schema.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  it('pagination：orderDirection 仅接受 asc / desc', () => {
    const schema = FindManyByPaginationDto.schema;

    expect(schema.parse({ orderDirection: 'desc' }).orderDirection).toBe(
      'desc',
    );
    expect(schema.safeParse({ orderDirection: 'up' }).success).toBe(false);
  });
});
