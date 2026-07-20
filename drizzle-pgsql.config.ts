import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle/pgsql',
  schema: './src/database/pgsql/schemas',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.PGSQL_HOST!,
    port: parseInt(process.env.PGSQL_PORT!),
    // 如果 PGSQL_DATABASE 是 ${APP_NAME} 则替换为 process.env.APP_NAME
    database: process.env.PGSQL_DATABASE!.replace(
      '${APP_NAME}', // 因为数据库名可能是根据 APP_NAME 动态生成的
      process.env.APP_NAME!,
    ),
    user: process.env.PGSQL_USER,
    password: process.env.PGSQL_PASSWORD,
  },
});
