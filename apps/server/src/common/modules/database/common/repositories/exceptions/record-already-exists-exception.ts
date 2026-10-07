import { RepositoryException } from './repository-exception';

/**
 * 记录已存在异常。
 *
 * 通常对应唯一键冲突或幂等性校验失败的语义，
 * 用于在创建资源时提示前端该记录已存在。
 */
export class RecordAlreadyExistsException extends RepositoryException {
  /**
   * 构造函数，固定消息“记录已存在”。
   */
  constructor() {
    super('记录已存在');
    this.name = 'RecordAlreadyExistsException';
  }
}
