import { ExtractTablesWithRelations } from 'drizzle-orm';
import { NodePgTransaction } from 'drizzle-orm/node-postgres';

export type PgsqlTransactionType = NodePgTransaction<
  typeof import('@/database/pgsql/schemas'),
  ExtractTablesWithRelations<typeof import('@/database/pgsql/schemas')>
>;
