import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle/pgsql',
  schema: './src/database/pgsql/schemas',
  dialect: 'postgresql',
  // 默认值与 .env.example 对齐；generate 不连库，凭据缺失不应导致配置加载失败
  dbCredentials: {
    host: process.env.PGSQL_HOST ?? '127.0.0.1',
    port: parseInt(process.env.PGSQL_PORT ?? '5432'),
    // 如果 PGSQL_DATABASE 是 ${APP_NAME} 则替换为 process.env.APP_NAME
    database: (process.env.PGSQL_DATABASE ?? '${APP_NAME}').replace(
      '${APP_NAME}', // 因为数据库名可能是根据 APP_NAME 动态生成的
      process.env.APP_NAME ?? 'nest-scaffold',
    ),
    user: process.env.PGSQL_USER ?? 'postgres',
    password: process.env.PGSQL_PASSWORD,
  },
});
