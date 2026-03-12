/**
 * 初始化器接口
 * 约定实现类需提供 run 方法执行初始化逻辑
 */
export interface IInitInitializer {
  run(): Promise<void>;
}
