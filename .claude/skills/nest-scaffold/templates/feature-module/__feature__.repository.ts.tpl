import { MySqlDatabaseType } from '@/common/modules/database/mysql/common/types/mysql-database.type';
import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import { generatePublicId } from '@/common/utils/public-id';
import { __featuresCamel__Schema } from '@/database/mysql/schemas/__features__.schema';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RecordAlreadyExistsException } from './common/exceptions/record-already-exists-exception';
import { RepositoryException } from './common/exceptions/repository-exception';
import { BaseRepository } from './common/mysql/base.repository';

/** 短码查空最大尝试次数（含首次） */
const SHORT_PUBLIC_ID_MAX_PROBE_ATTEMPTS = 8;

type __Feature__CreateData = Omit<
  typeof __featuresCamel__Schema.$inferInsert,
  'publicId' | 'shortPublicId'
>;

/**
 * __feature__ 仓储
 *
 * 长码直插、短码先查空；自定义查询经 `_buildWhereFilter`（软删除安全）。
 * 模板字段 `publicId` / `shortPublicId` 为占位名——请改成业务语义列名，
 * 并同步本文件方法名、Controller 路径参数与 Entity 字段。
 */
@Injectable()
export class __Feature__Repository extends BaseRepository<
  typeof __featuresCamel__Schema
> {
  constructor(
    private readonly _databaseService: DatabaseService,
    @InjectPinoLogger(__Feature__Repository.name)
    protected readonly _logger: PinoLogger,
  ) {
    super(__featuresCamel__Schema, _databaseService.db);
  }

  async findOneByPublicId(options: {
    db?: MySqlDatabaseType;
    publicId: string;
  }): Promise<typeof __featuresCamel__Schema.$inferSelect | null> {
    const { db = this._db, publicId } = options;
    const whereFilter = this._buildWhereFilter([
      eq(__featuresCamel__Schema.publicId, publicId),
    ]);
    const results = await db
      .select()
      .from(__featuresCamel__Schema)
      .where(whereFilter)
      .limit(1);
    return results[0] ?? null;
  }

  async findOneByShortPublicId(options: {
    db?: MySqlDatabaseType;
    shortPublicId: string;
  }): Promise<typeof __featuresCamel__Schema.$inferSelect | null> {
    const { db = this._db, shortPublicId } = options;
    const whereFilter = this._buildWhereFilter([
      eq(__featuresCamel__Schema.shortPublicId, shortPublicId),
    ]);
    const results = await db
      .select()
      .from(__featuresCamel__Schema)
      .where(whereFilter)
      .limit(1);
    return results[0] ?? null;
  }

  // @ts-expect-error 有公开标识列的表收窄 create 入参并加宽返回值
  async create(options: {
    db?: MySqlDatabaseType;
    data: __Feature__CreateData;
  }): Promise<{ id: number; publicId: string; shortPublicId: string }> {
    const { db, data } = options;
    const publicId = generatePublicId();
    const shortPublicId = await this._allocateShortPublicId({ db });
    try {
      const id = await super.create({
        db,
        data: { ...data, publicId, shortPublicId },
      });
      return { id, publicId, shortPublicId };
    } catch (error: unknown) {
      if (!(error instanceof RecordAlreadyExistsException)) {
        throw error;
      }
      if ((await this.findOneByPublicId({ db, publicId })) !== null) {
        this._logger.error(
          { event: 'public_id_collision', publicId },
          '长码 publicId 碰撞，已转为不透明错误',
        );
        throw new RepositoryException('数据写入失败，请稍后重试');
      }
      if (
        (await this.findOneByShortPublicId({ db, shortPublicId })) !== null
      ) {
        this._logger.error(
          { event: 'short_public_id_collision', shortPublicId },
          '短码 shortPublicId 插入时碰撞，已转为不透明错误',
        );
        throw new RepositoryException('数据写入失败，请稍后重试');
      }
      throw error;
    }
  }

  private async _allocateShortPublicId(options: {
    db?: MySqlDatabaseType;
  }): Promise<string> {
    const { db } = options;
    for (
      let attempt = 0;
      attempt < SHORT_PUBLIC_ID_MAX_PROBE_ATTEMPTS;
      attempt++
    ) {
      const shortPublicId = generatePublicId(8);
      if ((await this.findOneByShortPublicId({ db, shortPublicId })) === null) {
        return shortPublicId;
      }
    }
    this._logger.error(
      {
        event: 'short_public_id_probe_exhausted',
        maxAttempts: SHORT_PUBLIC_ID_MAX_PROBE_ATTEMPTS,
      },
      '短码查空次数耗尽，已转为不透明错误',
    );
    throw new RepositoryException('数据写入失败，请稍后重试');
  }
}
