import { EventEmitter } from 'events';
import { vi } from 'vitest';

/**
 * 用 EventEmitter 充当 ioredis 的 Redis / Cluster 实例
 *
 * 暴露：
 * - status：模拟客户端连接状态
 * - quit / disconnect：vi mock，便于断言关闭分支
 * - constructorArgs：保留构造时透传的参数，用于断言配置映射
 *
 * 独立成文件的原因：`vi.mock` 的工厂会被提升到文件顶部执行，
 * 无法引用测试文件顶层的类声明，只能通过动态 `import()` 引入。
 */
export class MockRedisClient extends EventEmitter {
  public status = 'ready';
  public readonly quit = vi.fn(async () => await Promise.resolve('OK'));
  public readonly disconnect = vi.fn();
  public constructor(public readonly constructorArgs: unknown[] = []) {
    super();
  }
}
