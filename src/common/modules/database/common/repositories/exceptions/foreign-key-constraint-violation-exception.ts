import { RepositoryException } from './repository-exception';

/**
 * 外键约束冲突异常。
 *
 * 在执行插入/更新/删除时违反外键约束（引用不存在或被引用中）抛出。
 * 常见响应语义为 409（Conflict）或 400（Bad Request）。
 */
export class ForeignKeyConstraintViolationException extends RepositoryException {
  /**
   * 构造函数，固定消息“外键约束冲突”。
   */
  constructor() {
    super('外键约束冲突');
    this.name = 'ForeignKeyConstraintViolationException';
  }
}
