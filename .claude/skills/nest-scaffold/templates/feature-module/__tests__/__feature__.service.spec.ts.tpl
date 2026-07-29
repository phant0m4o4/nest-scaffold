import { __Feature__Repository } from '@/app/repositories/__feature__.repository';
import appConfig from '@/configs/app.config';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { __Feature__Service } from '../__feature__.service';

const TEST_MASTER_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

describe('__Feature__Service', () => {
  let __featureCamel__Service: __Feature__Service;
  let mock__Feature__Repository: Partial<
    Record<keyof __Feature__Repository, Mock>
  >;

  beforeEach(async () => {
    mock__Feature__Repository = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOneByPublicId: vi.fn(),
      findManyWithCursorPagination: vi.fn(),
      findManyWithPagination: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        __Feature__Service,
        { provide: appConfig.KEY, useValue: { masterKey: TEST_MASTER_KEY } },
      ],
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
    it('应当创建 __feature__ 并返回 id 与公开标识', async () => {
      const inputBody = { name: '示例名称' };
      const expected = {
        id: 1,
        publicId: 'V1StGXR8_Z5jdHi6B-myT',
        shortPublicId: 'xY7_k2Qm',
      };
      (mock__Feature__Repository.create as Mock).mockResolvedValue(expected);

      const actual = await __featureCamel__Service.create(inputBody);

      expect(actual).toEqual(expected);
      expect(mock__Feature__Repository.create).toHaveBeenCalledWith({
        data: inputBody,
      });
    });
  });

  describe('findOneByPublicId', () => {
    it('应当通过长码 publicId 查询 __feature__', async () => {
      const inputPublicId = 'V1StGXR8_Z5jdHi6B-myT';
      const expected = {
        id: 1,
        publicId: inputPublicId,
        shortPublicId: 'xY7_k2Qm',
        name: '示例名称',
      };
      (
        mock__Feature__Repository.findOneByPublicId as Mock
      ).mockResolvedValue(expected);

      const actual =
        await __featureCamel__Service.findOneByPublicId(inputPublicId);

      expect(actual).toEqual(expected);
      expect(mock__Feature__Repository.findOneByPublicId).toHaveBeenCalledWith(
        { publicId: inputPublicId },
      );
    });
  });
});
