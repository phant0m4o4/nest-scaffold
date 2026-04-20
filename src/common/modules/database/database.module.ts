import databaseConfig from '@/configs/database.config';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';

/**
 * 数据库模块（全局）
 *
 * 基于 Drizzle ORM + MySQL2，提供：
 * - `DatabaseService`：数据库连接管理与 Drizzle 实例
 *
 * 在 `AppModule` 中 `imports: [DatabaseModule]` 一次即可；init/seed 与 `DATABASE_*` Token 由 `ToolsModule`（CLI）自行注册，不属于本模块职责。
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
