import { DATABASE_SEEDER } from '@/common/modules/database/constants/database.tokens';
import type { ISeeder } from '@/common/modules/database/interfaces/seeder.interface';
import { DatabaseService } from '@/common/modules/database/pgsql/database.service';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import inquirer from 'inquirer';

/**
 * 数据库工具服务（PostgreSQL）
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
   * 重建 public schema（连同表与自定义类型一并删除），并删除存放迁移记录的
   * drizzle schema（PG 的 __drizzle_migrations 在独立 schema，不删会导致重放被跳过），
   * 然后重放所有迁移，恢复表结构与基础数据；演示数据按需再跑 seed。
   */
  async reset(): Promise<void> {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: '即将重建 public schema 并重放迁移, 是否继续?',
        default: false,
      },
    ]);
    if (!answer.continue) {
      console.log('重置数据库已取消');
      return;
    }
    console.log('========== 重置数据库 ==========');

    const db = this._databaseService.db;
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    console.log('已重建 public schema 并清除迁移记录');

    await migrate(db, { migrationsFolder: 'drizzle/pgsql' });
    console.log('========== 迁移重放完成，数据库已回到基线 ==========');
  }
}
