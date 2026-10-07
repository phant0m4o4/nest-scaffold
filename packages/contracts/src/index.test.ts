import { describe, expect, it } from 'vitest';
import {
  adminDemoSchema,
  adminDemoDetailSchema,
  createDemoSchema,
  demoListQuerySchema,
  publicDemoDetailSchema,
  publicDemoSchema,
  updateDemoSchema,
} from './index';

const demo = {
  id: 1,
  parentId: null,
  publicId: 'public-demo',
  shortPublicId: 'short-demo',
  name: '示例',
  type: 'TYPE_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('公开 HTTP 契约', () => {
  it('用户模型不包含内部主键，管理端保留内部主键', () => {
    expect(publicDemoSchema.parse(demo)).not.toHaveProperty('id');
    expect(publicDemoSchema.parse(demo)).not.toHaveProperty('parentId');
    expect(adminDemoSchema.parse(demo)).toEqual(demo);
  });

  it('只接受 HTTP 中的日期字符串，拒绝本地 Date 和损坏的时间', () => {
    expect(
      publicDemoSchema.safeParse({ ...demo, createdAt: new Date() }).success,
    ).toBe(false);
    expect(
      publicDemoSchema.safeParse({ ...demo, updatedAt: 'invalid' }).success,
    ).toBe(false);
  });

  it.each([{ page: 0 }, { pageSize: 101 }, { page: 1.5 }, { type: 'UNKNOWN' }])(
    '拒绝后端不支持的列表参数 %j',
    (query) => expect(demoListQuerySchema.safeParse(query).success).toBe(false),
  );

  it('新增字段校验与更新清空父级保留正确语义', () => {
    expect(
      createDemoSchema.parse({ name: '  示例  ', type: 'TYPE_1' }),
    ).toEqual({ name: '示例', type: 'TYPE_1' });
    expect(updateDemoSchema.parse({ parentId: null })).toEqual({
      parentId: null,
    });
    expect(updateDemoSchema.parse({ name: '仅改名称' })).toEqual({
      name: '仅改名称',
    });
  });

  it.each([
    { name: '   ', type: 'TYPE_1' },
    { name: 'a'.repeat(101), type: 'TYPE_1' },
    { name: '名称', type: 'UNKNOWN' },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'].map((parentId) => ({
      name: '名称',
      type: 'TYPE_1',
      parentId,
    })),
  ])('拒绝不能保存的新增内容 %j', (input) => {
    expect(createDemoSchema.safeParse(input).success).toBe(false);
  });

  it.each([{}, { ignored: true }, { name: undefined }])(
    '拒绝没有有效字段的更新 %j',
    (input) => {
      expect(updateDemoSchema.safeParse(input).success).toBe(false);
    },
  );

  it('详情明确支持查无记录，公开详情不暴露内部字段', () => {
    expect(
      publicDemoDetailSchema.parse({ statusCode: 200, data: null }),
    ).toEqual({ statusCode: 200, data: null });
    const result = publicDemoDetailSchema.parse({
      statusCode: 200,
      data: demo,
    });
    expect(result.data).not.toHaveProperty('id');
    expect(result.data).not.toHaveProperty('parentId');
    expect(
      adminDemoDetailSchema.parse({ statusCode: 200, data: demo }).data,
    ).toEqual(demo);
  });

  it('仅允许客户端声明的排序列与方向', () => {
    expect(
      demoListQuerySchema.parse({ orderColumn: 'name', orderDirection: 'asc' }),
    ).toEqual({ orderColumn: 'name', orderDirection: 'asc' });
    expect(
      demoListQuerySchema.safeParse({ orderColumn: 'password' }).success,
    ).toBe(false);
    expect(
      demoListQuerySchema.safeParse({ orderDirection: 'up' }).success,
    ).toBe(false);
  });
});
