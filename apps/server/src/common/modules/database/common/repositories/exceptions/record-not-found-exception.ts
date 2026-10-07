import { RepositoryException } from './repository-exception';

/**
 * 记录未找到异常
 * 控制器/全局过滤器可将其映射为 404 或 400（视业务而定），
 * 并返回统一错误结构给前端。
 */
export class RecordNotFoundException extends RepositoryException {
  /**
   * 使用可选详情信息实例化异常。
   * @param details 可选的补充描述（如主键/查询条件等），便于排查
   */
  constructor(details?: string) {
    super(details ?? '记录不存在');
    this.name = 'RecordNotFoundException';
  }
}
