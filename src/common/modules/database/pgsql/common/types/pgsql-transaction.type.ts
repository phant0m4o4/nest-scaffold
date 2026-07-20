import { ExtractTablesWithRelations } from 'drizzle-orm';
import { NodePgTransaction } from 'drizzle-orm/node-postgres';

export type PgsqlTransactionType = NodePgTransaction<
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;
