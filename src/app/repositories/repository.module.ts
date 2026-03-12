import { DatabaseModule } from '@/common/modules/database/database.module';
import { DynamicModule, Module, Type } from '@nestjs/common';
import { MySqlTable } from 'drizzle-orm/mysql-core';
import { BaseRepository } from './common/base.repository';

/**
 * RepositoryModule 配置选项
 */
export interface IRepositoryModuleOptions {
  /** 是否注册为全局模块 */
  isGlobal?: boolean;
  /** 需要注册的仓储类列表 */
  repositories?: Type<BaseRepository<MySqlTable>>[];
}

/**
 * 仓储模块
 *
 * 统一管理仓储类的注册与导出。
 * - `forRoot`：在 AppModule 中一次性注册核心仓储，可选全局
 * - `forFeature`：在业务子模块中按需注册领域仓储
 */
@Module({
  imports: [DatabaseModule],
  exports: [DatabaseModule],
})
export class RepositoryModule {
  /**
   * 在根模块中注册仓储（可选全局）
   */
  static forRoot(options: IRepositoryModuleOptions = {}): DynamicModule {
    const { isGlobal, repositories = [] } = options;
    return {
      module: RepositoryModule,
      global: isGlobal ?? false,
      imports: [DatabaseModule],
      providers: repositories,
      exports: [DatabaseModule, ...repositories],
    };
  }

  /**
   * 在业务子模块中按需注册仓储
   */
  static forFeature(
    repositories: Type<BaseRepository<MySqlTable>>[],
  ): DynamicModule {
    return {
      module: RepositoryModule,
      imports: [DatabaseModule],
      providers: repositories,
      exports: [DatabaseModule, ...repositories],
    };
  }
}
