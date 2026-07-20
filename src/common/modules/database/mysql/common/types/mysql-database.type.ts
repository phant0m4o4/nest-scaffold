import { MySql2Database } from 'drizzle-orm/mysql2';

export type MySqlDatabaseType = MySql2Database<
  typeof import('@/database/schemas')
>;
