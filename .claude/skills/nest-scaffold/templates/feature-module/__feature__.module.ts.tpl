import { __Feature__Repository } from '@/app/repositories/__feature__.repository';
import { RepositoryModule } from '@/app/repositories/repository.module';
import appConfig from '@/configs/app.config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { __Feature__Controller } from './__feature__.controller';
import { __Feature__Service } from './__feature__.service';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    RepositoryModule.forFeature([__Feature__Repository]),
  ],
  controllers: [__Feature__Controller],
  providers: [__Feature__Service],
})
export class __Feature__Module {}
