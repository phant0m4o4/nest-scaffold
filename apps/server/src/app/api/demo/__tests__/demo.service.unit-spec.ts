import {
  ADMIN_DEMO_LIST_RESOURCE_KEY,
  DEMO_LIST_RESOURCE_KEY,
  DemoService,
} from '@/app/api/demo/demo.service';
import { DemoRepository } from '@/app/repositories/demo.repository';
import { RecordNotFoundException } from '@/common/modules/database/common/repositories/exceptions/record-not-found-exception';
import { buildCursorScope } from '@/common/modules/database/mysql/repositories/utils/cursor/build-cursor-scope';
import { encodeCursor } from '@/common/modules/database/mysql/repositories/utils/cursor/encode-cursor';
import appConfig from '@/configs/app.config';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const TEST_MASTER_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

describe('DemoService', () => {
  let demoService: DemoService;
  let mockDemoRepository: Partial<Record<keyof DemoRepository, Mock>>;

  beforeEach(async () => {
    mockDemoRepository = {
      findManyWithCursorPagination: vi.fn(),
      findManyWithPagination: vi.fn(),
      findOneByPublicId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DemoService,
        {
          provide: appConfig.KEY,
          useValue: { masterKey: TEST_MASTER_KEY },
        },
      ],
    })
      .useMocker((token) => {
        if (token === DemoRepository) {
          return mockDemoRepository;
        }
        return {};
      })
      .compile();

    demoService = moduleRef.get(DemoService);
  });

  it('第一页应将仓储 keyset 加密为 nextCursor', async () => {
    (mockDemoRepository.findManyWithCursorPagination as Mock).mockResolvedValue(
      {
        data: [{ id: 2, name: 'b' }],
        meta: {
          nextCursor: [{ column: 'id', direction: 'desc', value: 2 }],
        },
      },
    );

    const actual = await demoService.findManyByCursorPagination(
      { limit: 1 },
      DEMO_LIST_RESOURCE_KEY,
    );

    expect(actual.data).toHaveLength(1);
    expect(typeof actual.meta.nextCursor).toBe('string');
    expect(actual.meta.nextCursor!.split('.')).toHaveLength(3);
    expect(
      mockDemoRepository.findManyWithCursorPagination,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 1,
        cursor: undefined,
        order: [{ column: 'id', direction: 'desc' }],
      }),
    );
  });

  it('合法 cursor 应解码后传给仓储', async () => {
    const scope = buildCursorScope(DEMO_LIST_RESOURCE_KEY, {});
    const inputCursor = encodeCursor(
      {
        scope,
        order: [{ column: 'id', direction: 'desc', value: 5 }],
      },
      TEST_MASTER_KEY,
    );

    (mockDemoRepository.findManyWithCursorPagination as Mock).mockResolvedValue(
      {
        data: [],
        meta: { nextCursor: null },
      },
    );

    await demoService.findManyByCursorPagination(
      { cursor: inputCursor, limit: 10 },
      DEMO_LIST_RESOURCE_KEY,
    );

    expect(
      mockDemoRepository.findManyWithCursorPagination,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: [{ column: 'id', direction: 'desc', value: 5 }],
      }),
    );
  });

  it('scope 不一致（改筛选）应 400', async () => {
    const scope = buildCursorScope(DEMO_LIST_RESOURCE_KEY, { name: 'old' });
    const inputCursor = encodeCursor(
      {
        scope,
        order: [{ column: 'id', direction: 'desc', value: 1 }],
      },
      TEST_MASTER_KEY,
    );

    await expect(
      demoService.findManyByCursorPagination(
        { cursor: inputCursor, name: 'new' },
        DEMO_LIST_RESOURCE_KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('用户端 cursor 用到管理端 resourceKey 应 400', async () => {
    const scope = buildCursorScope(DEMO_LIST_RESOURCE_KEY, {});
    const inputCursor = encodeCursor(
      {
        scope,
        order: [{ column: 'id', direction: 'desc', value: 1 }],
      },
      TEST_MASTER_KEY,
    );

    await expect(
      demoService.findManyByCursorPagination(
        { cursor: inputCursor },
        ADMIN_DEMO_LIST_RESOURCE_KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([' ', '   ', '\t'])(
    '新增非空的空白筛选 %j 后应拒绝未筛选游标',
    async (name) => {
      const cursor = encodeCursor(
        {
          scope: buildCursorScope(DEMO_LIST_RESOURCE_KEY, {}),
          order: [{ column: 'id', direction: 'desc', value: 1 }],
        },
        TEST_MASTER_KEY,
      );
      (
        mockDemoRepository.findManyWithCursorPagination as Mock
      ).mockResolvedValue({
        data: [],
        meta: { nextCursor: null },
      });

      await expect(
        demoService.findManyByCursorPagination(
          { cursor, name },
          DEMO_LIST_RESOURCE_KEY,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        mockDemoRepository.findManyWithCursorPagination,
      ).not.toHaveBeenCalled();
    },
  );

  it('真正空串筛选与未传筛选等价，仍可使用原游标且不生成 LIKE 条件', async () => {
    const cursor = encodeCursor(
      {
        scope: buildCursorScope(DEMO_LIST_RESOURCE_KEY, {}),
        order: [{ column: 'id', direction: 'desc', value: 1 }],
      },
      TEST_MASTER_KEY,
    );
    (mockDemoRepository.findManyWithCursorPagination as Mock).mockResolvedValue(
      {
        data: [],
        meta: { nextCursor: null },
      },
    );

    await demoService.findManyByCursorPagination(
      { cursor, name: '' },
      DEMO_LIST_RESOURCE_KEY,
    );

    expect(
      mockDemoRepository.findManyWithCursorPagination,
    ).toHaveBeenCalledWith(expect.objectContaining({ filter: [] }));
  });

  it('order 声明与 cursor 不一致应 400', async () => {
    const scope = buildCursorScope(DEMO_LIST_RESOURCE_KEY, {});
    const inputCursor = encodeCursor(
      {
        scope,
        order: [{ column: 'id', direction: 'desc', value: 1 }],
      },
      TEST_MASTER_KEY,
    );

    await expect(
      demoService.findManyByCursorPagination(
        { cursor: inputCursor, order: 'id:asc' },
        DEMO_LIST_RESOURCE_KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('篡改密文应 400', async () => {
    await expect(
      demoService.findManyByCursorPagination(
        { cursor: 'a.b.c' },
        DEMO_LIST_RESOURCE_KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([1, 100])('limit=%s 时可空列应在查询仓储前拒绝', async (limit) => {
    await expect(
      demoService.findManyByCursorPagination(
        { limit, order: 'parentId:asc,id:asc' },
        DEMO_LIST_RESOURCE_KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      mockDemoRepository.findManyWithCursorPagination,
    ).not.toHaveBeenCalled();
  });

  it('普通页码分页仍应允许按可空列排序', async () => {
    const expected = { data: [], meta: { total: 0 } };
    (mockDemoRepository.findManyWithPagination as Mock).mockResolvedValue(
      expected,
    );

    await expect(
      demoService.findManyByPagination({ orderColumn: 'parentId' }),
    ).resolves.toEqual(expected);
    expect(mockDemoRepository.findManyWithPagination).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { column: 'parentId', direction: 'desc' },
      }),
    );
  });

  it('更新不能将自身设为父级，且不能写入仓储', async () => {
    await expect(demoService.update(1, { parentId: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockDemoRepository.update).not.toHaveBeenCalled();
  });

  it('清空父级关联应将 null 原样传入仓储', async () => {
    await demoService.update(1, { parentId: null });
    expect(mockDemoRepository.update).toHaveBeenCalledWith({
      id: 1,
      data: { parentId: null },
    });
  });

  it('公开标识更新也不能绕过自身关联校验', async () => {
    (mockDemoRepository.findOneByPublicId as Mock).mockResolvedValue({ id: 1 });
    await expect(
      demoService.updateByPublicId('public-demo', { parentId: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDemoRepository.update).not.toHaveBeenCalled();
  });

  it('公开标识不存在时更新、删除应抛出记录不存在，不能静默成功', async () => {
    (mockDemoRepository.findOneByPublicId as Mock).mockResolvedValue(null);
    await expect(
      demoService.updateByPublicId('missing', { name: 'updated' }),
    ).rejects.toBeInstanceOf(RecordNotFoundException);
    await expect(
      demoService.deleteByPublicId('missing'),
    ).rejects.toBeInstanceOf(RecordNotFoundException);
    expect(mockDemoRepository.update).not.toHaveBeenCalled();
    expect(mockDemoRepository.delete).not.toHaveBeenCalled();
  });
});
