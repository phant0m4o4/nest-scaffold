import { RepositoryException } from './repository-exception';

/**
 * 锁等待超时异常。
 *
 * 当事务等待获取锁超过数据库配置阈值时抛出。
 * 可结合重试策略与合理的锁粒度设计来缓解。
 */
export class LockWaitTimeoutException extends RepositoryException {
  /**
   * 构造函数，固定消息“锁等待超时”。
   */
  constructor() {
    super('锁等待超时');
    this.name = 'LockWaitTimeoutException';
  }
}
