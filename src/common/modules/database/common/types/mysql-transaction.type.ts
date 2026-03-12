import { ExtractTablesWithRelations } from 'drizzle-orm';
import { MySqlTransaction } from 'drizzle-orm/mysql-core';
import {
  MySql2PreparedQueryHKT,
  MySql2QueryResultHKT,
} from 'drizzle-orm/mysql2';

export type MySqlTransactionType = MySqlTransaction<
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
  typeof import('@/database/schemas'),
  ExtractTablesWithRelations<typeof import('@/database/schemas')>
>;
