import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
/**
 * 数据库配置（MySQL）
 *
 * .env 示例：
 * MYSQL_HOST=127.0.0.1
 * MYSQL_PORT=3306
 * MYSQL_DATABASE=sjhy
 * MYSQL_USER=root
 * MYSQL_PASSWORD=123456
 */
class EnvironmentVariables {
  @Expose()
  @IsString()
  @IsOptional()
  MYSQL_HOST?: string;
  @Expose()
  @IsInt()
  @IsOptional()
  MYSQL_PORT?: number;
  @Expose()
  @IsString()
  @IsNotEmpty()
  MYSQL_DATABASE: string;
  @Expose()
  @IsString()
  @IsNotEmpty()
  MYSQL_USER: string;
  @Expose()
  @IsString()
  @IsNotEmpty()
  MYSQL_PASSWORD: string;
}
const databaseConfig = registerEnvAsConfig(
  'database',
  EnvironmentVariables,
  (env) => {
    return {
      host: env.MYSQL_HOST ?? '127.0.0.1',
      port: env.MYSQL_PORT ?? 3306,
      database: env.MYSQL_DATABASE,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
    };
  },
);
export type DatabaseConfigType = ConfigType<typeof databaseConfig>;
export default databaseConfig;
