import { DemoRepository } from '@/app/repositories/demo.repository';
import { RepositoryModule } from '@/common/modules/database/repository.module';
import appConfig from '@/configs/app.config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminDemoController } from './admin-demo.controller';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { EnvironmentEnum } from '@/common/enums/environment.enum';

// Demo API 仅用于开发与测试，避免脚手架被直接部署后暴露无鉴权 CRUD。
const demoControllers =
  process.env.NODE_ENV === EnvironmentEnum.PRODUCTION
    ? []
    : [DemoController, AdminDemoController];

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    RepositoryModule.forFeature([DemoRepository]),
  ],
  controllers: demoControllers,
  providers: [DemoService],
})
export class DemoModule {}
