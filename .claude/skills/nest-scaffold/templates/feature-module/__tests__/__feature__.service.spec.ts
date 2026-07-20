import { __Feature__Repository } from '@/app/repositories/__feature__.repository';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { __Feature__Service } from '../__feature__.service';

describe('__Feature__Service', () => {
  let __featureCamel__Service: __Feature__Service;
  let mock__Feature__Repository: Partial<Record<keyof __Feature__Repository, Mock>>;

  beforeEach(async () => {
    mock__Feature__Repository = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      findManyWithCursorPagination: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [__Feature__Service],
    })
      .useMocker((token) => {
        if (token === __Feature__Repository) {
          return mock__Feature__Repository;
        }
      })
      .compile();

    __featureCamel__Service = moduleRef.get(__Feature__Service);
  });

  describe('create', () => {
    it('应当创建 __feature__ 并返回 id', async () => {
      const inputBody = { name: '示例名称' };
      const expectedId = 1;
      (mock__Feature__Repository.create as Mock).mockImplementation(
        async () => await Promise.resolve(expectedId),
      );

      const actualId = await __featureCamel__Service.create(inputBody);

      expect(actualId).toBe(expectedId);
      expect(mock__Feature__Repository.create).toHaveBeenCalledWith({
        data: inputBody,
      });
    });
  });

  describe('findOne', () => {
    it('应当通过 id 查询 __feature__', async () => {
      const inputId = 1;
      const expected = { id: inputId, name: '示例名称' };
      (mock__Feature__Repository.findOne as Mock).mockImplementation(
        async () => await Promise.resolve(expected),
      );

      const actual = await __featureCamel__Service.findOne(inputId);

      expect(actual).toEqual(expected);
      expect(mock__Feature__Repository.findOne).toHaveBeenCalledWith({ id: inputId });
    });
  });
});
