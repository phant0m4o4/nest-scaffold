import { RepositoryException } from './repository-exception';

/**
 * 数据完整性异常。
 *
 * 常见触发场景：唯一索引冲突、非空约束违反、检查约束失败等。
 * 建议在仓储层拦截 ORM/数据库错误码后抛出此异常，
 * 由全局异常过滤器映射为 400（Bad Request）或 409（Conflict）。
 */
export class DataIntegrityViolationException extends RepositoryException {
  /**
   * 使用可读的错误消息实例化异常。
   * @param message 自定义错误信息，默认“数据完整性异常”。
   */
  constructor(message = '数据完整性异常') {
    super(message);
    this.name = 'DataIntegrityViolationException';
  }
}
