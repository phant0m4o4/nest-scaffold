/**
 * 队列并发控制选项
 *
 * 用于扩展 BullMQ 注册选项，支持全局并发限制。
 * 全局并发通过 Redis 原子操作实现，跨所有 Worker 进程生效。
 */
export interface IQueueConcurrencyOptions {
  /**
   * 全局并发限制（跨所有 Worker 进程）
   *
   * 设置后，模块初始化时通过 BullMQ 的 Queue.setGlobalConcurrency() 生效。
   * 所有进程的 Worker 加起来同时最多执行指定数量的任务。
   * @remarks 值为正整数；0 或 undefined 表示不限制全局并发
   */
  globalConcurrency?: number;
}
