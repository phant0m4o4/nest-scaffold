import bottleneckConfig from '@/configs/bottleneck.config';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BottleneckService } from './bottleneck.service';
import { IBottleneckModuleOptions } from './interfaces/bottleneck-config.interface';

/**
 * Bottleneck 限流模块
 *
 * 提供基于 bottleneck 库的通用限流服务，支持内存和 Redis 两种模式。
 *
 * 使用方式：
 * - 在 `AppModule` 中以 `BottleneckModule.forRoot({ isGlobal: true })` 注册为全局模块
 * - 其他模块直接注入 `BottleneckService` 即可使用，无需重复 import
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Module({
  imports: [ConfigModule.forFeature(bottleneckConfig)],
  providers: [BottleneckService],
  exports: [BottleneckService],
})
export class BottleneckModule {
  /**
   * 注册限流模块
   * @param options.isGlobal 是否注册为全局模块（推荐 true）
   */
  static forRoot(options: IBottleneckModuleOptions = {}): DynamicModule {
    const { isGlobal } = options;
    return {
      module: BottleneckModule,
      global: isGlobal ?? false,
    };
  }
}
