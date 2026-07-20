import { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * PG 版尚未绑定业务 Schema（`src/database` 下的 Schema 均为 mysql-core 定义），
 * 待新增 pg-core Schema 后可将 `typeof schema` 传入泛型参数。
 */
export type PgsqlDatabaseType = NodePgDatabase;
