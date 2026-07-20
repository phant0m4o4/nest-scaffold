import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
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
const environmentSchema = z.object({
  MYSQL_HOST: z.string().optional(),
  MYSQL_PORT: z.coerce.number().int().optional(),
  MYSQL_DATABASE: z.string().min(1),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().min(1),
});
const mysqlDatabaseConfig = registerEnvAsConfig(
  'mysqlDatabase',
  environmentSchema,
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
export type MysqlDatabaseConfigType = ConfigType<typeof mysqlDatabaseConfig>;
export default mysqlDatabaseConfig;
