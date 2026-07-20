import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
class EnvironmentVariables {
  @Expose()
  @IsString()
  @IsOptional()
  PGSQL_HOST?: string;
  @Expose()
  @IsInt()
  @IsOptional()
  PGSQL_PORT?: number;
  @Expose()
  @IsString()
  @IsNotEmpty()
  PGSQL_DATABASE: string;
  @Expose()
  @IsString()
  @IsNotEmpty()
  PGSQL_USER: string;
  @Expose()
  @IsString()
  @IsNotEmpty()
  PGSQL_PASSWORD: string;
}
const pgsqlDatabaseConfig = registerEnvAsConfig(
  'pgsqlDatabase',
  EnvironmentVariables,
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
