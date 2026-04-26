import { DatabaseService } from '@/common/modules/database/database.service';
import { __featuresCamel__Schema } from '@/database/schemas/__features__.schema';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './common/base.repository';

/**
 * __feature__ 仓储
 *
 * 继承 BaseRepository 获得通用 CRUD 能力，
 * 并扩展 __feature__ 表特有的查询方法。
 */
@Injectable()
export class __Feature__Repository extends BaseRepository<typeof __featuresCamel__Schema> {
  constructor(
    private readonly _databaseService: DatabaseService,
    @InjectPinoLogger(__Feature__Repository.name)
    protected readonly _logger: PinoLogger,
  ) {
    super(__featuresCamel__Schema, _databaseService.db);
  }

  // 按需扩展自定义查询，例如：
  //
  // async findOneByName(options: { db?: MySqlDatabaseType; name: string }) {
  //   const { db = this._db, name } = options;
  //   const results = await db
  //     .select()
  //     .from(__featuresCamel__Schema)
  //     .where(eq(__featuresCamel__Schema.name, name))
  //     .limit(1);
  //   return results[0] ?? null;
  // }
}
