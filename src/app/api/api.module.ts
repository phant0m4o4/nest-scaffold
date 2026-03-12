import { DemoModule } from '@/app/api/demo/demo.module';
import { Module } from '@nestjs/common';

/**
 * API 模块
 *
 * 聚合所有 API 相关的子模块
 */
@Module({
  imports: [DemoModule],
})
export class ApiModule {}
