import { MySqlDatabaseType } from '@/common/modules/database/common/types/mysql-database.type';
import { DatabaseService } from '@/common/modules/database/database.service';
import { demosSchema } from '@/database/schemas/demos.schema';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './common/base.repository';

/**
 * Demo 仓储
 *
 * 继承 BaseRepository 获得通用 CRUD 能力，
 * 并扩展 Demo 表特有的查询方法。
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
   * @param options.db 数据库事务实例（可选）
   * @param options.name 名称
   * @returns Demo 记录或 null
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
}
