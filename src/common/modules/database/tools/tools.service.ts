import {
  DATABASE_INIT_INITIALIZER,
  DATABASE_SEEDER,
} from '@/common/modules/database/constants/database.tokens';
import type { IInitInitializer } from '@/common/modules/database/interfaces/init-initializer.interface';
import type { ISeeder } from '@/common/modules/database/interfaces/seeder.interface';
import { Inject, Injectable } from '@nestjs/common';

/**
 * 数据库工具服务
 *
 * 通过注入 Token 获取 init/seed 实现，供 CLI 脚本调用
 */
@Injectable()
export class ToolsService {
  constructor(
    @Inject(DATABASE_INIT_INITIALIZER)
    private readonly _initInitializer: IInitInitializer,
    @Inject(DATABASE_SEEDER)
    private readonly _seeder: ISeeder,
  ) {}

  /** 执行数据库结构初始化 */
  async init(): Promise<void> {
    await this._initInitializer.run();
  }

  /** 执行种子数据填充 */
  async seed(): Promise<void> {
    await this._seeder.run();
  }
}
