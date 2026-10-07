import {
  adminDemoSchema,
  createDemoSchema,
  publicDemoSchema,
  updateDemoSchema,
} from '@nest-scaffold/contracts';
import { describe, expect, it } from 'vitest';
import { CreateDemoRequestDto } from '../dtos/create-demo-request.dto';
import { UpdateDemoRequestDto } from '../dtos/update-demo-request.dto';
import { DemoEntity } from '../entities/demo.entity';
import { DemoPublicEntity } from '../entities/demo-public.entity';

describe('前后端 Demo 契约一致性', () => {
  const row = {
    id: 1,
    parentId: null,
    publicId: 'public-demo',
    shortPublicId: 'short-demo',
    name: '示例',
    type: 'TYPE_1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('实际用户实体序列化结果符合共享 JSON 契约且不暴露内部主键', () => {
    const json: unknown = JSON.parse(
      JSON.stringify(DemoPublicEntity.create(row)),
    );
    expect(publicDemoSchema.parse(json)).toEqual(json);
    expect(json).not.toHaveProperty('id');
  });

  it('实际管理端实体序列化结果符合共享 JSON 契约', () => {
    const json: unknown = JSON.parse(JSON.stringify(DemoEntity.create(row)));
    expect(adminDemoSchema.parse(json)).toEqual(json);
  });

  it.each([
    { input: { name: '  示例  ', type: 'TYPE_1' }, valid: true },
    {
      input: { name: '示例', type: 'TYPE_2', parentId: null },
      valid: true,
    },
    {
      input: { name: 'a'.repeat(100), type: 'TYPE_3', parentId: 1 },
      valid: true,
    },
    { input: { name: '   ', type: 'TYPE_1' }, valid: false },
    { input: { name: 'a'.repeat(101), type: 'TYPE_1' }, valid: false },
    { input: { name: '示例', type: 'TYPE_4' }, valid: false },
    { input: { name: '示例', type: 'TYPE_1', parentId: 0 }, valid: false },
    { input: { name: '示例', type: 'TYPE_1', parentId: 1.5 }, valid: false },
    { input: { name: '示例', type: 'TYPE_1', parentId: '1' }, valid: false },
    {
      input: {
        name: '示例',
        type: 'TYPE_1',
        parentId: Number.MAX_SAFE_INTEGER + 1,
      },
      valid: false,
    },
  ])('创建输入两端校验与净化一致：%j', ({ input, valid }) => {
    const server = CreateDemoRequestDto.schema.safeParse(input);
    const client = createDemoSchema.safeParse(input);
    expect(server.success).toBe(valid);
    expect(client.success).toBe(valid);
    if (server.success && client.success) {
      expect(server.data).toEqual(client.data);
    }
  });

  it.each([
    { input: { name: '  修改  ' }, valid: true },
    { input: { parentId: null }, valid: true },
    { input: { type: 'TYPE_2' }, valid: true },
    { input: { name: '修改', unrelated: true }, valid: true },
    { input: {}, valid: false },
    { input: { name: undefined }, valid: false },
    { input: { unrelated: true }, valid: false },
    { input: { name: '   ' }, valid: false },
    { input: { name: 'a'.repeat(101) }, valid: false },
    { input: { parentId: -1 }, valid: false },
    { input: { type: 'TYPE_4' }, valid: false },
  ])('更新输入两端校验与净化一致：%j', ({ input, valid }) => {
    const server = UpdateDemoRequestDto.schema.safeParse(input);
    const client = updateDemoSchema.safeParse(input);
    expect(server.success).toBe(valid);
    expect(client.success).toBe(valid);
    if (server.success && client.success) {
      expect(server.data).toEqual(client.data);
    }
  });
});
