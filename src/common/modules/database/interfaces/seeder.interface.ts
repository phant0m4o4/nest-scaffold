/**
 * 数据填充器接口
 * 约定实现类需提供 run 方法执行种子数据填充逻辑
 */
export interface ISeeder {
  run(): Promise<void>;
}
