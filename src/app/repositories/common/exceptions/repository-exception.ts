/**
 * 仓储层基础异常。
 *
 * 用于在仓储（Repository）与服务层之间提供统一的异常抽象，
 * 将数据库/ORM 抛出的底层错误（如唯一键冲突、外键约束、锁超时等）
 * 映射为明确的业务可读异常，便于全局异常过滤器统一响应给前端。
 *
 * 使用建议：
 * - 派生出具体异常类型进行语义化表达（如 RecordNotFoundException）。
 * - 控制器层由全局过滤器将其转换为统一响应结构与 HTTP 状态码。
 */
export class RepositoryException extends Error {
  /**
   * 使用描述性消息实例化异常。
   * @param message 错误详情，建议包含业务上下文（如表名、关键字段），便于排查
   */
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryException';
  }
}
