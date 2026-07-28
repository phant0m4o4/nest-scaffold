import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { normalizeError } from '@/common/utils/normalize-error';
import type { PgsqlDatabaseConfigType } from '@/configs/pgsql-database.config';
import * as schema from '@/database/pgsql/schemas';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as DrizzleLogger } from 'drizzle-orm/logger';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/**
 * 将单个参数格式化为可直接粘贴回 SQL 的字面量。
 *
 * - null / undefined → `NULL`
 * - string → 单引号包裹，转义内部单引号
 * - number / bigint / boolean → 直接 toString
 * - Date → ISO 格式（去掉时区后缀，方便粘回 PostgreSQL）
 * - Buffer → `X'<hex>'` 字面量
 * - 其他对象 → 转为 JSON 后按字符串处理
 */
function formatSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
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
 * 仅替换位于字符串字面量之外的 `$n` 占位符（PostgreSQL 风格），避免误替换字面量场景。
 */
function inlineSqlParams(query: string, params: readonly unknown[]): string {
  let result = '';
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (quote) {
      result += ch;
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      result += ch;
      continue;
    }
    if (ch === '$' && /[0-9]/.test(query[i + 1] ?? '')) {
      let digits = '';
      let j = i + 1;
      while (j < query.length && /[0-9]/.test(query[j])) {
        digits += query[j];
        j++;
      }
      result += formatSqlLiteral(params[Number(digits) - 1]);
      i = j - 1;
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
 * 数据库服务（PostgreSQL）
 *
 * 基于 node-postgres 连接池 + Drizzle ORM，提供：
 * - `db`：Drizzle 数据库实例
 * - 连接池生命周期管理（启动验证、平滑关闭）
 * - 开发环境 SQL 查询日志
 *
 * 与 `../mysql/database.service.ts` 是平行的两套实现。
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly _pool: Pool;

  /** Drizzle ORM 数据库实例，绑定全部 Schema */
  public readonly db: NodePgDatabase<typeof schema>;

  constructor(
    private readonly _configService: ConfigService,
    @InjectPinoLogger(DatabaseService.name)
    private readonly _logger: PinoLogger,
  ) {
    this._pool = new Pool(
      this._configService.getOrThrow<PgsqlDatabaseConfigType>('pgsqlDatabase'),
    );
    const isDev = process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT;
    this.db = drizzle({
      client: this._pool,
      schema,
      logger: isDev ? new DrizzleQueryLogger(this._logger) : undefined,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const client = await this._pool.connect();
      await client.query('SELECT 1');
      client.release();
      this._logger.info('数据库 PostgreSQL 连接成功');
    } catch (error) {
      this._logger.error(
        {
          error: normalizeError(error),
          event: 'db_connect_failed',
        },
        '数据库 PostgreSQL 连接失败',
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
