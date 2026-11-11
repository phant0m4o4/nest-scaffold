import {
  ADMIN_DEMO_LIST_RESOURCE_KEY,
  DEMO_LIST_RESOURCE_KEY,
  DemoService,
} from '@/app/api/demo/demo.service';
import { DemoRepository } from '@/app/repositories/demo.repository';
import { RecordNotFoundException } from '@/common/modules/database/common/repositories/exceptions/record-not-found-exception';
import { buildCursorScope } from '@/common/modules/database/mysql/repositories/utils/cursor/build-cursor-scope';
import { encodeCursor } from '@/common/modules/database/mysql/repositories/utils/cursor/encode-cursor';
import { generatePublicId } from '@/common/utils/public-id';
import appConfig from '@/configs/app.config';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hkdfSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const TEST_MASTER_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);
const TEST_CODE_SECRET_KEY = Buffer.from(
  hkdfSync(
    'sha256',
    TEST_MASTER_KEY,
    Buffer.alloc(0),
    'nest-scaffold/demo-code/ff1/v1',
    32,
  ),
);

function codeForId(sequence: number | bigint, size = 6): string {
  return generatePublicId(size, 'ff1', {
    sequence,
    secretKey: TEST_CODE_SECRET_KEY,
    tweak: 'demos/code',
  });
}

describe('DemoService', () => {
  let demoService: DemoService;
  let mockDemoRepository: Partial<Record<keyof DemoRepository, Mock>>;

  beforeEach(async () => {
    mockDemoRepository = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
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

  it('创建和详情查询应为同一主键返回一致的 code，且不修改仓储对象', async () => {
    const row = Object.freeze({
      id: 42,
      publicId: 'public-demo',
      shortPublicId: 'short-demo',
    });
    const expected = { ...row, code: codeForId(row.id) };
    const body = { name: '示例', type: 'TYPE_1' };
    (mockDemoRepository.create as Mock).mockResolvedValue(row);
    (mockDemoRepository.findOne as Mock).mockResolvedValue(row);
    (mockDemoRepository.findOneByPublicId as Mock).mockResolvedValue(row);

    await expect(demoService.create(body)).resolves.toEqual(expected);
    await expect(demoService.findOne(row.id)).resolves.toEqual(expected);
    await expect(demoService.findOneByPublicId(row.publicId)).resolves.toEqual(
      expected,
    );

    expect(expected.code).toMatch(/^\d{6}$/);
    expect(mockDemoRepository.create).toHaveBeenCalledWith({ data: body });
    expect(row).not.toHaveProperty('code');
  });

  it('列表和两类分页应为每条记录补充 code，并保留分页信息', async () => {
    const rows = Object.freeze([
      Object.freeze({ id: 1, name: '第一条' }),
      Object.freeze({ id: 1_000_000, name: '第二条' }),
    ]);
    const expected = [
      { ...rows[0], code: codeForId(1, 6) },
      { ...rows[1], code: codeForId(1_000_000, 8) },
    ];
    const meta = { page: 1, pageSize: 30, total: 2, pageCount: 1 };
    (mockDemoRepository.findAll as Mock).mockResolvedValue(rows);
    (mockDemoRepository.findManyWithPagination as Mock).mockResolvedValue({
      data: rows,
      meta,
    });
    (mockDemoRepository.findManyWithCursorPagination as Mock).mockResolvedValue(
      { data: rows, meta: { nextCursor: null } },
    );

    await expect(demoService.findAll()).resolves.toEqual(expected);
    await expect(demoService.findManyByPagination({})).resolves.toEqual({
      data: expected,
      meta,
    });
    await expect(
      demoService.findManyByCursorPagination({}, DEMO_LIST_RESOURCE_KEY),
    ).resolves.toEqual({ data: expected, meta: { nextCursor: null } });
    expect(rows[0]).not.toHaveProperty('code');
    expect(rows[1]).not.toHaveProperty('code');
  });

  it.each([
    { id: 1, size: 6 },
    { id: 999_999, size: 6 },
    { id: 1_000_000, size: 8 },
    { id: 99_999_999, size: 8 },
    { id: 100_000_000, size: 10 },
    { id: 9_999_999_999, size: 10 },
    { id: 10_000_000_000, size: 12 },
    { id: 999_999_999_999, size: 12 },
    { id: 1_000_000_000_000, size: 14 },
    { id: 99_999_999_999_999, size: 14 },
    { id: 100_000_000_000_000, size: 16 },
    { id: Number.MAX_SAFE_INTEGER, size: 16 },
  ])(
    '主键 $id 应生成 $size 位 code，并能无损还原查询',
    async ({ id, size }) => {
      const row = { id, name: '示例' };
      const code = codeForId(id, size);
      (mockDemoRepository.findOne as Mock).mockResolvedValue(row);

      const result = await demoService.findOne(id);
      expect(result).toEqual({ ...row, code });
      expect(result!.code).toHaveLength(size);
      await expect(demoService.findOneByCode(code)).resolves.toEqual({
        ...row,
        code,
      });

      expect(mockDemoRepository.findOne).toHaveBeenCalledWith({ id });
      expect(mockDemoRepository.findOneByPublicId).not.toHaveBeenCalled();
    },
  );

  it('详情查询查无记录时应保留 null', async () => {
    (mockDemoRepository.findOne as Mock).mockResolvedValue(null);
    (mockDemoRepository.findOneByPublicId as Mock).mockResolvedValue(null);

    await expect(demoService.findOne(42)).resolves.toBeNull();
    await expect(demoService.findOneByPublicId('missing')).resolves.toBeNull();
    await expect(demoService.findOneByCode(codeForId(42))).resolves.toBeNull();
  });

  it.each([
    '',
    '12345',
    '1234567',
    '123456789',
    '12345678901',
    '1234567890123',
    '123456789012345',
    '12345678901234567',
    '12345a',
    '12345\n',
    '123456789012345a',
    '123456789012345\n',
  ])('无效 code %j 应在查询仓储前拒绝', async (code) => {
    await expect(demoService.findOneByCode(code)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockDemoRepository.findOne).not.toHaveBeenCalled();
  });

  it.each([
    { id: 0n, size: 6 },
    { id: BigInt(Number.MAX_SAFE_INTEGER) + 1n, size: 16 },
  ])(
    'code 解码为无效主键 $id 时应拒绝，避免主键精度丢失',
    async ({ id, size }) => {
      await expect(
        demoService.findOneByCode(codeForId(id, size)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDemoRepository.findOne).not.toHaveBeenCalled();
    },
  );

  it.each([
    { id: 1, size: 8 },
    { id: 42, size: 16 },
    { id: 1_000_000, size: 10 },
  ])(
    '主键 $id 被编码为非规范的 $size 位 code 时应拒绝',
    async ({ id, size }) => {
      await expect(
        demoService.findOneByCode(codeForId(id, size)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDemoRepository.findOne).not.toHaveBeenCalled();
    },
  );

  it('相同配置下重新创建服务应生成相同 code 并能查询原记录', async () => {
    const row = { id: 42, name: '示例' };
    (mockDemoRepository.findOne as Mock).mockResolvedValue(row);
    const first = await demoService.findOne(row.id);
    const restartedModule = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: DemoRepository, useValue: mockDemoRepository },
        { provide: appConfig.KEY, useValue: { masterKey: TEST_MASTER_KEY } },
      ],
    }).compile();
    const restartedService = restartedModule.get(DemoService);

    try {
      await expect(restartedService.findOne(row.id)).resolves.toEqual(first);
      await expect(
        restartedService.findOneByCode(first!.code),
      ).resolves.toEqual(first);
    } finally {
      await restartedModule.close();
    }
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
