import { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type PgsqlDatabaseType = NodePgDatabase<
  typeof import('@/database/pgsql/schemas')
>;
