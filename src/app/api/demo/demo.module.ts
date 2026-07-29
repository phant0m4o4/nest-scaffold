import { DemoRepository } from '@/app/repositories/demo.repository';
import { RepositoryModule } from '@/app/repositories/repository.module';
import appConfig from '@/configs/app.config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminDemoController } from './admin-demo.controller';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    RepositoryModule.forFeature([DemoRepository]),
  ],
  controllers: [DemoController, AdminDemoController],
  providers: [DemoService],
})
export class DemoModule {}
