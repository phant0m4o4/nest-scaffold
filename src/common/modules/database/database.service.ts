import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { normalizeError } from '@/common/utils/normalize-error';
import type { DatabaseConfigType } from '@/configs/database.config';
import * as schema from '@/database/schemas';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as DrizzleLogger } from 'drizzle-orm/logger';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/**
 * Drizzle ORM 查询日志代理
 *
 * 将 SQL 查询参数内联替换后输出到 PinoLogger，仅开发环境启用
 */
class DrizzleQueryLogger implements DrizzleLogger {
  constructor(private readonly _logger: PinoLogger) {}

  logQuery(query: string, params: unknown[]): void {
    let index = 0;
    const combinedQuery = query.replace(/\?/g, () => {
      const value = params[index++];
      return typeof value === 'string' ? `'${value}'` : String(value);
    });
    this._logger.debug({ event: 'db_query' }, combinedQuery);
  }
}

/**
 * 数据库服务
 *
 * 基于 MySQL2 连接池 + Drizzle ORM，提供：
 * - `db`：Drizzle 数据库实例，供 Repository 层直接使用
 * - 连接池生命周期管理（启动验证、优雅关闭）
 * - 开发环境 SQL 查询日志
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly _pool: mysql.Pool;

  /** Drizzle ORM 数据库实例，绑定全部 Schema */
  public readonly db: MySql2Database<typeof schema>;

  constructor(
    private readonly _configService: ConfigService,
    @InjectPinoLogger(DatabaseService.name)
    private readonly _logger: PinoLogger,
  ) {
    this._pool = mysql.createPool(
      this._configService.getOrThrow<DatabaseConfigType>('database'),
    );
    const isDev = process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT;
    this.db = drizzle({
      client: this._pool,
      schema,
      mode: 'default',
      logger: isDev ? new DrizzleQueryLogger(this._logger) : undefined,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const connection = await this._pool.getConnection();
      await connection.ping();
      connection.release();
      this._logger.info('数据库 MySQL 连接成功');
    } catch (error) {
      this._logger.error(
        {
          error: normalizeError(error),
          event: 'db_connect_failed',
        },
        '数据库 MySQL 连接失败',
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this._pool.end();
      this._logger.info('数据库连接已关闭');
    } catch (error) {
      this._logger.warn(
        {
          error: normalizeError(error),
          event: 'db_close_warn',
        },
        '关闭数据库连接时发生错误',
      );
    }
  }
}
