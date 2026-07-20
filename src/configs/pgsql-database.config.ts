import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
/**
 * 数据库配置（PostgreSQL）
 *
 * .env 示例：
 * PGSQL_HOST=127.0.0.1
 * PGSQL_PORT=5432
 * PGSQL_DATABASE=sjhy
 * PGSQL_USER=postgres
 * PGSQL_PASSWORD=123456
 */
const environmentSchema = z.object({
  PGSQL_HOST: z.string().optional(),
  PGSQL_PORT: z.coerce.number().int().optional(),
  PGSQL_DATABASE: z.string().min(1),
  PGSQL_USER: z.string().min(1),
  PGSQL_PASSWORD: z.string().min(1),
});
const pgsqlDatabaseConfig = registerEnvAsConfig(
  'pgsqlDatabase',
  environmentSchema,
  (env) => {
    return {
      host: env.PGSQL_HOST ?? '127.0.0.1',
      port: env.PGSQL_PORT ?? 5432,
      database: env.PGSQL_DATABASE,
      user: env.PGSQL_USER,
      password: env.PGSQL_PASSWORD,
    };
  },
);
export type PgsqlDatabaseConfigType = ConfigType<typeof pgsqlDatabaseConfig>;
export default pgsqlDatabaseConfig;
