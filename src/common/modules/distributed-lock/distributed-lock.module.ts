import distributedLockConfig from '@/configs/distributed-lock.config';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DistributedLockService } from './distributed-lock.service';

/**
 * 分布式锁模块（全局）
 *
 * 基于 Redlock 的分布式锁，用于跨实例竞争资源（如任务处理、结算、对账）时保证互斥。
 * 使用方式：在 AppModule 中导入 `DistributedLockModule` 即可（已标记 @Global），
 * 其他模块注入 DistributedLockService 即可。
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(distributedLockConfig)],
  providers: [DistributedLockService],
  exports: [DistributedLockService],
})
export class DistributedLockModule {}
