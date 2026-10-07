import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle/mysql',
  schema: './src/database/mysql/schemas',
  dialect: 'mysql',
  // 默认值与 .env.example 对齐；generate 不连库，凭据缺失不应导致配置加载失败
  dbCredentials: {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT ?? '3306'),
    // 如果 MYSQL_DATABASE 是 ${APP_NAME} 则替换为 process.env.APP_NAME
    database: (process.env.MYSQL_DATABASE ?? '${APP_NAME}').replace(
      '${APP_NAME}', // 因为数据库名可能是根据 APP_NAME 动态生成的
      process.env.APP_NAME ?? 'nest-scaffold',
    ),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD,
  },
});
