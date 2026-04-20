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
 * 将单个参数格式化为可直接粘贴回 SQL 的字面量。
 *
 * - null / undefined → `NULL`
 * - string → 单引号包裹，转义内部单引号
 * - number / bigint / boolean → 直接 toString
 * - Date → ISO 格式（去掉时区后缀，方便粘回 MySQL）
 * - Buffer → `X'<hex>'` 字面量
 * - 其他对象 → 转为 JSON 后按字符串处理
 */
function formatSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return `'${raw.replace(/'/g, "''")}'`;
}

/**
 * 将 drizzle 生成的参数化 SQL 内联成可读形式。
 *
 * 仅替换位于字符串字面量之外的 `?` 占位符，避免误替换 `LIKE '%?%'` 等场景中的字面量 `?`。
 */
function inlineSqlParams(query: string, params: readonly unknown[]): string {
  let result = '';
  let paramIndex = 0;
  let quote: "'" | '"' | '`' | null = null;
  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (quote) {
      result += ch;
      if (ch === '\\' && i + 1 < query.length) {
        result += query[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      result += ch;
      continue;
    }
    if (ch === '?') {
      result += formatSqlLiteral(params[paramIndex++]);
      continue;
    }
    result += ch;
  }
  return result;
}

/**
 * Drizzle ORM 查询日志代理
 *
 * 将 SQL 查询参数内联替换后输出到 PinoLogger，仅开发环境启用。
 * 原始 query 与 params 也会以结构化字段附带输出，方便定位参数异常。
 */
class DrizzleQueryLogger implements DrizzleLogger {
  constructor(private readonly _logger: PinoLogger) {}

  logQuery(query: string, params: unknown[]): void {
    this._logger.debug(
      { event: 'db_query', query, params },
      inlineSqlParams(query, params),
    );
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
