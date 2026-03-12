/**
 * Bottleneck 库的本地类型定义
 *
 * bottleneck 的类型声明文件在严格 ESLint 规则下会被解析为 error 类型，
 * 导致大量 `no-unsafe-*` 报错。此处定义服务中实际使用到的类型子集，
 * 通过 `as unknown as IBottleneckLimiter` 在构造点显式断言，消除级联报错。
 */

/** Bottleneck 限流器实例的方法签名子集 */
export interface IBottleneckLimiter {
  wrap<T>(fn: () => Promise<T>): () => Promise<T>;
  schedule<T>(fn: () => Promise<T>): Promise<T>;
  counts(): IBottleneckCounts;
  currentReservoir(): Promise<number | null>;
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  ready: Promise<unknown>;
}

/** Bottleneck.counts() 返回值 */
export interface IBottleneckCounts {
  RECEIVED: number;
  QUEUED: number;
  RUNNING: number;
  EXECUTING: number;
  DONE: number;
}

/** Bottleneck IORedisConnection 实例的方法签名子集 */
export interface IBottleneckConnection {
  on(event: string, handler: (...args: unknown[]) => void): void;
  disconnect(flush: boolean): Promise<void>;
  ready: unknown;
}

/**
 * Bottleneck 构造选项的类型子集
 *
 * 仅包含本服务实际使用到的字段，完整选项见 bottleneck 官方文档。
 */
export interface IBottleneckOptions {
  maxConcurrent?: number | null;
  minTime?: number;
  highWater?: number | null;
  strategy?: number;
  penalty?: number | null;
  reservoir?: number | null;
  reservoirRefreshInterval?: number | null;
  reservoirRefreshAmount?: number | null;
  reservoirIncreaseInterval?: number | null;
  reservoirIncreaseAmount?: number | null;
  reservoirIncreaseMaximum?: number | null;
  id?: string;
  rejectOnDrop?: boolean;
  trackDoneStatus?: boolean;
  /** Redis 模式下由服务自动注入，外部不应手动传入 */
  connection?: IBottleneckConnection;
  [key: string]: unknown;
}
