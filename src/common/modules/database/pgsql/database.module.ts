import pgsqlDatabaseConfig from '@/configs/pgsql-database.config';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';

/**
 * PostgreSQL 数据库模块（全局）
 *
 * 基于 Drizzle ORM + node-postgres，提供：
 * - `DatabaseService`：数据库连接管理与 Drizzle 实例
 *
 * 与 `../mysql/database.module.ts` 是平行的两套实现，项目按需二选一或同时在 `AppModule` 中导入。
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(pgsqlDatabaseConfig)],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
