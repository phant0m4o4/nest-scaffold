import { MySqlDatabaseType } from '@/common/modules/database/mysql/common/types/mysql-database.type';
import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import { generatePublicId } from '@/common/utils/public-id';
import { demosSchema } from '@/database/mysql/schemas/demos.schema';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RecordAlreadyExistsException } from './common/exceptions/record-already-exists-exception';
import { RepositoryException } from './common/exceptions/repository-exception';
import { BaseRepository } from './common/mysql/base.repository';

/** 短码查空最大尝试次数（含首次）；查到空闲后再 insert */
const SHORT_PUBLIC_ID_MAX_PROBE_ATTEMPTS = 8;

type DemoCreateData = Omit<
  typeof demosSchema.$inferInsert,
  'publicId' | 'shortPublicId'
>;

/**
 * Demo 仓储
 *
 * `create` 重载同时分配：
 * - **长码 publicId**：generate → insert；碰撞极低，不重试，转不透明错误
 * - **短码 shortPublicId**：循环 generate → 查空 → 再随行 insert；查空耗尽或
 *   insert 竞态撞唯一约束 → 同样不透明错误
 *
 * `name` 等业务唯一键冲突仍抛 {@link RecordAlreadyExistsException}。
 */
@Injectable()
export class DemoRepository extends BaseRepository<typeof demosSchema> {
  constructor(
    private readonly _databaseService: DatabaseService,
    @InjectPinoLogger(DemoRepository.name)
    protected readonly _logger: PinoLogger,
  ) {
    super(demosSchema, _databaseService.db);
  }

  /**
   * 根据名称查找 Demo
   */
  async findOneByName(options: {
    db?: MySqlDatabaseType;
    name: string;
  }): Promise<typeof demosSchema.$inferSelect | null> {
    const { db = this._db, name } = options;
    const results = await db
      .select()
      .from(demosSchema)
      .where(eq(demosSchema.name, name))
      .limit(1);
    return results[0] ?? null;
  }

  /**
   * 根据长码公开标识查找（用户端路径读查）
   */
  async findOneByPublicId(options: {
    db?: MySqlDatabaseType;
    publicId: string;
  }): Promise<typeof demosSchema.$inferSelect | null> {
    const { db = this._db, publicId } = options;
    const results = await db
      .select()
      .from(demosSchema)
      .where(eq(demosSchema.publicId, publicId))
      .limit(1);
    return results[0] ?? null;
  }

  /**
   * 根据短码公开标识查找（推荐码兑换等）
   */
  async findOneByShortPublicId(options: {
    db?: MySqlDatabaseType;
    shortPublicId: string;
  }): Promise<typeof demosSchema.$inferSelect | null> {
    const { db = this._db, shortPublicId } = options;
    const results = await db
      .select()
      .from(demosSchema)
      .where(eq(demosSchema.shortPublicId, shortPublicId))
      .limit(1);
    return results[0] ?? null;
  }

  /**
   * 创建 Demo：自动分配长码 publicId + 短码 shortPublicId
   */
  // @ts-expect-error 有公开标识列的表收窄 create 入参并加宽返回值，刻意偏离基类签名
  async create(options: {
    db?: MySqlDatabaseType;
    data: DemoCreateData;
  }): Promise<{ id: number; publicId: string; shortPublicId: string }> {
    const { db, data } = options;
    // 长码：直接生成，不查、不重试
    const publicId = generatePublicId();
    // 短码：先查空再带入 insert
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
      if (await this._isPublicIdTaken({ db, publicId })) {
        this._logger.error(
          { event: 'public_id_collision', publicId },
          '长码 publicId 碰撞（极低概率），已转为不透明错误',
        );
        throw new RepositoryException('数据写入失败，请稍后重试');
      }
      if (await this._isShortPublicIdTaken({ db, shortPublicId })) {
        // 查空与 insert 之间的竞态：不再换号，不透明报错
        this._logger.error(
          { event: 'short_public_id_collision', shortPublicId },
          '短码 shortPublicId 插入时碰撞（竞态），已转为不透明错误',
        );
        throw new RepositoryException('数据写入失败，请稍后重试');
      }
      throw error;
    }
  }

  /**
   * 短码：循环 generate → 查是否占用，找到空闲码后返回（供随后 insert）
   */
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
      if (!(await this._isShortPublicIdTaken({ db, shortPublicId }))) {
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

  private async _isPublicIdTaken(options: {
    db?: MySqlDatabaseType;
    publicId: string;
  }): Promise<boolean> {
    return (await this.findOneByPublicId(options)) !== null;
  }

  private async _isShortPublicIdTaken(options: {
    db?: MySqlDatabaseType;
    shortPublicId: string;
  }): Promise<boolean> {
    return (await this.findOneByShortPublicId(options)) !== null;
  }
}
