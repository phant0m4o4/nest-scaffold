import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordAlreadyExistsException } from '../common/exceptions/record-already-exists-exception';
import { RepositoryException } from '../common/exceptions/repository-exception';
import { BaseRepository } from '../common/mysql/base.repository';
import { DemoRepository } from '../demo.repository';

describe('DemoRepository.create', () => {
  let repository: DemoRepository;
  let logger: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = { error: vi.fn() };
    repository = new DemoRepository(
      { db: {} } as unknown as DatabaseService,
      logger as unknown as PinoLogger,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('成功时应返回 id、长码 publicId 与短码 shortPublicId', async () => {
    vi.spyOn(repository, 'findOneByShortPublicId').mockResolvedValue(null);
    vi.spyOn(BaseRepository.prototype, 'create').mockResolvedValueOnce(42);

    const actual = await repository.create({
      data: { name: 'a', type: 'TYPE_1' },
    });

    expect(actual.id).toBe(42);
    expect(actual.publicId).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(actual.shortPublicId).toMatch(/^[A-Za-z0-9_-]{8}$/);
    const createMock = vi.mocked(BaseRepository.prototype.create);
    expect(createMock).toHaveBeenCalledTimes(1);
    const createArg = createMock.mock.calls[0]?.[0] as {
      data: { name: string; publicId: string; shortPublicId: string };
    };
    expect(createArg.data).toMatchObject({
      name: 'a',
      publicId: actual.publicId,
      shortPublicId: actual.shortPublicId,
    });
  });

  it('短码查空耗尽时应抛出不透明错误且探测满 8 次', async () => {
    const isTaken = vi
      .spyOn(repository, 'findOneByShortPublicId')
      .mockResolvedValue({
        id: 1,
        shortPublicId: 'taken000',
      } as Awaited<ReturnType<DemoRepository['findOneByShortPublicId']>>);

    await expect(
      repository.create({ data: { name: 'a', type: 'TYPE_1' } }),
    ).rejects.toBeInstanceOf(RepositoryException);

    expect(isTaken).toHaveBeenCalledTimes(8);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'short_public_id_probe_exhausted' }),
      expect.any(String),
    );
  });

  it('长码 publicId 碰撞时应抛出不透明的 RepositoryException', async () => {
    vi.spyOn(repository, 'findOneByShortPublicId').mockResolvedValue(null);
    const conflict = new RecordAlreadyExistsException();
    vi.spyOn(BaseRepository.prototype, 'create').mockRejectedValueOnce(
      conflict,
    );
    vi.spyOn(repository, 'findOneByPublicId').mockResolvedValueOnce({
      id: 1,
      publicId: 'taken',
    } as Awaited<ReturnType<DemoRepository['findOneByPublicId']>>);

    await expect(
      repository.create({ data: { name: 'a', type: 'TYPE_1' } }),
    ).rejects.toBeInstanceOf(RepositoryException);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'public_id_collision' }),
      expect.any(String),
    );
  });

  it('短码 insert 竞态碰撞时应抛出不透明的 RepositoryException', async () => {
    const conflict = new RecordAlreadyExistsException();
    vi.spyOn(BaseRepository.prototype, 'create').mockRejectedValueOnce(
      conflict,
    );
    vi.spyOn(repository, 'findOneByPublicId').mockResolvedValueOnce(null);
    // 分配阶段查空返回 null；insert 失败后再查则已占用（竞态）
    vi.spyOn(repository, 'findOneByShortPublicId')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 2,
        shortPublicId: 'race0001',
      } as Awaited<ReturnType<DemoRepository['findOneByShortPublicId']>>);

    await expect(
      repository.create({ data: { name: 'a', type: 'TYPE_1' } }),
    ).rejects.toBeInstanceOf(RepositoryException);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'short_public_id_collision' }),
      expect.any(String),
    );
  });

  it('name 等其它唯一冲突时应原样抛出 RecordAlreadyExistsException', async () => {
    vi.spyOn(repository, 'findOneByShortPublicId').mockResolvedValue(null);
    const conflict = new RecordAlreadyExistsException();
    vi.spyOn(BaseRepository.prototype, 'create').mockRejectedValueOnce(
      conflict,
    );
    vi.spyOn(repository, 'findOneByPublicId').mockResolvedValueOnce(null);

    await expect(
      repository.create({ data: { name: 'dup', type: 'TYPE_1' } }),
    ).rejects.toBe(conflict);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('非唯一约束错误应原样抛出', async () => {
    vi.spyOn(repository, 'findOneByShortPublicId').mockResolvedValue(null);
    const boom = new Error('db down');
    vi.spyOn(BaseRepository.prototype, 'create').mockRejectedValueOnce(boom);

    await expect(
      repository.create({ data: { name: 'a', type: 'TYPE_1' } }),
    ).rejects.toBe(boom);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
