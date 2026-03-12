import distributedLockConfig from '@/configs/distributed-lock.config';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DistributedLockService } from './distributed-lock.service';

/**
 * 分布式锁模块
 *
 * 基于 Redlock 的分布式锁，用于跨实例竞争资源（如任务处理、结算、对账）时保证互斥。
 * 使用方式：在 AppModule 中以 DistributedLockModule.forRoot({ isGlobal: true }) 注册，
 * 或按需导入；其他模块注入 DistributedLockService 即可。
 */
@Module({
  imports: [ConfigModule.forFeature(distributedLockConfig)],
  providers: [DistributedLockService],
  exports: [DistributedLockService],
})
export class DistributedLockModule {
  /**
   * 注册分布式锁模块
   * @param options.isGlobal 是否注册为全局模块（推荐 true）
   */
  static forRoot(options: { isGlobal?: boolean } = {}): DynamicModule {
    const { isGlobal } = options;
    return {
      module: DistributedLockModule,
      global: isGlobal ?? false,
    };
  }
}
