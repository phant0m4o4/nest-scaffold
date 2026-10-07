import { DATABASE_SEEDER } from '@/common/modules/database/constants/database.tokens';
import { LoggerModule } from '@/common/modules/logger/logger.module';
import { SeedService } from '@/database/pgsql/seed';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database.module';
import { ToolsService } from './tools.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true, // 缓存配置
      expandVariables: true, // 扩展变量
    }),
    LoggerModule.forRoot({ name: 'database-tools' }),
    DatabaseModule,
  ],
  providers: [
    { provide: DATABASE_SEEDER, useClass: SeedService },
    ToolsService,
  ],
  exports: [ToolsService],
})
export class ToolsModule {}
