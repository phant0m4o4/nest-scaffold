import { DATABASE_SEEDER } from '@/common/modules/database/constants/database.tokens';
import type { ISeeder } from '@/common/modules/database/interfaces/seeder.interface';
import { Inject, Injectable } from '@nestjs/common';

/**
 * 数据库工具服务
 *
 * 通过注入 Token 获取 seed 实现，供 CLI 脚本调用。
 * 表结构与基础数据均由 migration 维护（drizzle/<dialect>/），不在此处。
 */
@Injectable()
export class ToolsService {
  constructor(
    @Inject(DATABASE_SEEDER)
    private readonly _seeder: ISeeder,
  ) {}

  /** 执行种子数据填充 */
  async seed(): Promise<void> {
    await this._seeder.run();
  }
}
