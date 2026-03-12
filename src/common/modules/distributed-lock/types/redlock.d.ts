/**
 * Redlock 类型声明（参考 redlock 官方源码 v5）
 * @see https://github.com/mike-marcacci/node-redlock
 */
/// <reference types="node" />

declare module 'redlock' {
  import type { EventEmitter } from 'events';
  import type {
    Redis as IORedisClient,
    Cluster as IORedisCluster,
  } from 'ioredis';

  /** Redis 客户端类型：单实例或集群 */
  type Client = IORedisClient | IORedisCluster;

  /**
   * 单次客户端执行结果
   * - vote "for": 成功，value 为脚本返回值
   * - vote "against": 失败，携带 error
   */
  export type ClientExecutionResult =
    | { client: Client; vote: 'for'; value: number }
    | { client: Client; vote: 'against'; error: Error };

  /**
   * 单次执行的统计：成员数、法定人数、赞成/反对集合
   */
  export type ExecutionStats = {
    readonly membershipSize: number;
    readonly quorumSize: number;
    readonly votesFor: Set<Client>;
    readonly votesAgainst: Map<Client, Error>;
  };

  /**
   * 执行结果：多次尝试的 Promise 数组（每次为 ExecutionStats）
   */
  export type ExecutionResult = {
    attempts: ReadonlyArray<Promise<ExecutionStats>>;
  };

  /**
   * Redlock 实例配置
   * - driftFactor: 时钟漂移系数
   * - retryCount: 重试次数
   * - retryDelay: 重试间隔（毫秒）
   * - retryJitter: 重试抖动（毫秒）
   * - automaticExtensionThreshold: 自动续期阈值（毫秒）
   */
  export interface Settings {
    readonly driftFactor: number;
    readonly retryCount: number;
    readonly retryDelay: number;
    readonly retryJitter: number;
    readonly automaticExtensionThreshold: number;
  }

  /**
   * 资源已被其他锁占用时的错误
   */
  export class ResourceLockedError extends Error {
    readonly message: string;
    constructor(message: string);
  }

  /**
   * 操作未在法定人数节点上通过时的错误，携带 attempts 便于排查
   */
  export class ExecutionError extends Error {
    readonly message: string;
    readonly attempts: ReadonlyArray<Promise<ExecutionStats>>;
    constructor(
      message: string,
      attempts: ReadonlyArray<Promise<ExecutionStats>>,
    );
  }

  /**
   * 锁对象：成功加锁后返回，提供 release、extend 方法
   */
  export class Lock {
    readonly redlock: Redlock;
    readonly resources: string[];
    readonly value: string;
    readonly attempts: ReadonlyArray<Promise<ExecutionStats>>;
    expiration: number;
    constructor(
      redlock: Redlock,
      resources: string[],
      value: string,
      attempts: ReadonlyArray<Promise<ExecutionStats>>,
      expiration: number,
    );
    /** 释放锁 */
    release(): Promise<ExecutionResult>;
    /** 按 duration（毫秒）续期 */
    extend(duration: number, settings?: Partial<Settings>): Promise<Lock>;
  }

  /**
   * using 回调中收到的中止信号；自动续期失败时会设置 aborted 与 error
   */
  export type RedlockAbortSignal = AbortSignal & { error?: Error };

  /**
   * Redlock 主类
   *
   * 使用至少一个 Redis 客户端（或客户端可迭代）与可选配置构造。
   * 首次使用后不应再修改实例属性，以免影响已持有的锁。
   */
  export default class Redlock extends EventEmitter {
    readonly clients: Set<Client>;
    readonly settings: Settings;
    readonly scripts: {
      readonly acquireScript: { value: string; hash: string };
      readonly extendScript: { value: string; hash: string };
      readonly releaseScript: { value: string; hash: string };
    };

    constructor(
      clients: Iterable<Client>,
      settings?: Partial<Settings>,
      scripts?: {
        readonly acquireScript?: string | ((script: string) => string);
        readonly extendScript?: string | ((script: string) => string);
        readonly releaseScript?: string | ((script: string) => string);
      },
    );

    /** 关闭所有客户端连接 */
    quit(): Promise<void>;

    /** 获取资源锁，duration 为 TTL（毫秒） */
    acquire(
      resources: string[],
      duration: number,
      settings?: Partial<Settings>,
    ): Promise<Lock>;

    /** 释放指定锁；若无法在法定人数节点释放会 reject，锁会按 TTL 自动过期 */
    release(lock: Lock, settings?: Partial<Settings>): Promise<ExecutionResult>;

    /** 对已有锁续期 duration（毫秒） */
    extend(
      existing: Lock,
      duration: number,
      settings?: Partial<Settings>,
    ): Promise<Lock>;

    /**
     * 在自动续期锁下执行 routine，返回 routine 的 Promise。
     * 续期失败时会更新 AbortSignal，回调内应检查 signal.aborted 并处理 signal.error。
     *
     * @overload 仅 routine（无 settings）
     * @overload settings + 可选 routine
     */
    using<T>(
      resources: string[],
      duration: number,
      routine: (signal: RedlockAbortSignal) => Promise<T>,
    ): Promise<T>;
    using<T>(
      resources: string[],
      duration: number,
      settings: Partial<Settings>,
      routine?: (signal: RedlockAbortSignal) => Promise<T>,
    ): Promise<T>;
  }
}
