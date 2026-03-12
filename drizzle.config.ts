import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/database/schemas',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.MYSQL_HOST!,
    port: parseInt(process.env.MYSQL_PORT!),
    // 如果 MYSQL_DATABASE 是 ${APP_NAME} 则替换为 process.env.APP_NAME
    database: process.env.MYSQL_DATABASE!.replace(
      '${APP_NAME}', // 因为数据库名可能是根据 APP_NAME 动态生成的
      process.env.APP_NAME!,
    ),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  },
});
