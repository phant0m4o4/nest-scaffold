import { LoggerModule } from '@/common/modules/logger/logger.module';
import { InitService } from '@/database/init';
import { SeedService } from '@/database/seed';
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
    DatabaseModule.forRoot({
      initInitializer: InitService,
      seeder: SeedService,
    }),
  ],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
