import type { BottleneckConfigType } from '@/configs/bottleneck.config';

/**
 * Bottleneck 模块配置接口
 *
 * 用于 BottleneckModule.forRoot() 方法的配置选项
 */
export interface IBottleneckModuleOptions {
  /**
   * 是否设置为全局模块
   * 设置为 true 后，可以在任何模块中直接注入 BottleneckService，无需导入 BottleneckModule
   * 默认值: false
   */
  isGlobal?: boolean;
}

/**
 * Bottleneck 配置类型
 *
 * 从配置文件导出的配置类型，包含所有限流相关的配置项
 */
export type IBottleneckConfig = BottleneckConfigType;
