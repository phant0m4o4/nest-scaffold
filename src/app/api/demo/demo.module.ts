import { DemoRepository } from '@/app/repositories/demo.repository';
import { RepositoryModule } from '@/app/repositories/repository.module';
import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [RepositoryModule.forFeature([DemoRepository])],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
