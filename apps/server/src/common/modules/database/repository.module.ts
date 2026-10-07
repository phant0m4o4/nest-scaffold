import { DynamicModule, Module, Type } from '@nestjs/common';
import { MySqlTable } from 'drizzle-orm/mysql-core';
import { PgTable } from 'drizzle-orm/pg-core';
import { BaseRepository as MysqlBaseRepository } from './mysql/repositories/base.repository';
import { BaseRepository as PgsqlBaseRepository } from './pgsql/repositories/base.repository';

/**
 * 任意方言的仓储基类（MySQL / PostgreSQL）
 */
export type AnyBaseRepositoryType =
  MysqlBaseRepository<MySqlTable> | PgsqlBaseRepository<PgTable>;

/**
 * RepositoryModule 配置选项
 */
export interface IRepositoryModuleOptions {
  /** 是否注册为全局模块 */
  isGlobal?: boolean;
  /** 需要注册的仓储类列表 */
  repositories?: Type<AnyBaseRepositoryType>[];
}

/**
 * 仓储注册模块
 *
 * 统一管理业务仓储类的注册与导出，但不在数据库模块中集中注册业务仓储。
 * - `forRoot`：在 AppModule 中一次性注册核心仓储，可选全局
 * - `forFeature`：在业务子模块中按需注册领域仓储
 *
 * 依赖已在 `AppModule` 中导入的 `DatabaseModule`（全局 `DatabaseService`）。
 * 本模块与数据库连接基础设施放在同一目录，但保持独立的按业务注册边界。
 */
@Module({})
export class RepositoryModule {
  /**
   * 在根模块中注册仓储（可选全局）
   */
  static forRoot(options: IRepositoryModuleOptions = {}): DynamicModule {
    const { isGlobal, repositories = [] } = options;
    return {
      module: RepositoryModule,
      global: isGlobal ?? false,
      providers: repositories,
      exports: repositories,
    };
  }

  /**
   * 在业务子模块中按需注册仓储
   */
  static forFeature(
    repositories: Type<AnyBaseRepositoryType>[],
  ): DynamicModule {
    return {
      module: RepositoryModule,
      providers: repositories,
      exports: repositories,
    };
  }
}
