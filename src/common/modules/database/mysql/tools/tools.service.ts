import { DATABASE_SEEDER } from '@/common/modules/database/constants/database.tokens';
import type { ISeeder } from '@/common/modules/database/interfaces/seeder.interface';
import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import inquirer from 'inquirer';

/**
 * 数据库工具服务
 *
 * 通过注入 Token 获取 seed 实现，供 CLI 脚本调用。
 * 表结构与基础数据均由 migration 维护（drizzle/<dialect>/）。
 */
@Injectable()
export class ToolsService {
  constructor(
    @Inject(DATABASE_SEEDER)
    private readonly _seeder: ISeeder,
    private readonly _databaseService: DatabaseService,
  ) {}

  /** 执行种子数据填充 */
  async seed(): Promise<void> {
    await this._seeder.run();
  }

  /**
   * 重置数据库到「迁移完成」基线
   *
   * 删除当前库全部表（含迁移记录表 __drizzle_migrations）后重放所有迁移，
   * 恢复表结构与基础数据；演示数据按需再跑 seed。
   */
  async reset(): Promise<void> {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: '即将删除当前库全部表并重放迁移, 是否继续?',
        default: false,
      },
    ]);
    if (!answer.continue) {
      console.log('重置数据库已取消');
      return;
    }
    console.log('========== 重置数据库 ==========');

    const db = this._databaseService.db;
    const [rows] = (await db.execute(
      sql`SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE()`,
    )) as unknown as [Array<{ tableName: string }>, unknown];

    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
    for (const { tableName } of rows) {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
    }
    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    console.log(`已删除 ${rows.length} 张表`);

    await migrate(db, { migrationsFolder: 'drizzle/mysql' });
    console.log('========== 迁移重放完成，数据库已回到基线 ==========');
  }
}
