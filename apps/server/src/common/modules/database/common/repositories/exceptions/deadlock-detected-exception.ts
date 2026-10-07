import { RepositoryException } from './repository-exception';

/**
 * 死锁检测异常。
 *
 * 当数据库检测到互相等待的锁依赖导致事务无法推进时触发。
 * 典型处理方式是进行幂等重试或升级为分布式锁方案。
 */
export class DeadlockDetectedException extends RepositoryException {
  /**
   * 构造函数，固定消息“检测到死锁”。
   */
  constructor() {
    super('检测到死锁');
    this.name = 'DeadlockDetectedException';
  }
}
