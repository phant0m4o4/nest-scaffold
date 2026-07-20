import { DataIntegrityViolationException } from '../../exceptions/data-integrity-violation-exception';
import { DeadlockDetectedException } from '../../exceptions/deadlock-detected-exception';
import { ForeignKeyConstraintViolationException } from '../../exceptions/foreign-key-constraint-violation-exception';
import { LockWaitTimeoutException } from '../../exceptions/lock-wait-timeout-exception';
import { RecordAlreadyExistsException } from '../../exceptions/record-already-exists-exception';

/** PostgreSQL 错误对象的类型安全访问结构 */
interface IPgsqlErrorLike {
  code?: string;
  cause?: {
    code?: string;
  };
}

/**
 * 判断未知值是否具有 PostgreSQL 错误的结构特征
 */
function isPgsqlErrorLike(error: unknown): error is IPgsqlErrorLike {
  return typeof error === 'object' && error !== null;
}

/**
 * 从 PostgreSQL 错误中提取 SQLSTATE code
 *
 * pg 错误可能直接携带 code，也可能嵌套在 cause 属性内（如 Drizzle 包装后），
 * 此方法统一提取，优先使用 cause 层级的值。
 */
function extractPgsqlErrorCode(error: unknown): string | undefined {
  if (!isPgsqlErrorLike(error)) {
    return undefined;
  }
  return error.cause?.code ?? error.code;
}

/**
 * 根据 PostgreSQL 错误信息映射为领域异常并抛出
 *
 * 统一在数据访问层使用该方法来将 PostgreSQL 错误（SQLSTATE）转换为更易理解的领域异常。
 * 该方法不会返回，始终抛出异常（never）。
 */
export function mapPgsqlErrorAndThrow(error: unknown): never {
  const code = extractPgsqlErrorCode(error);
  // 唯一约束 — unique_violation (23505)
  if (code === '23505') {
    throw new RecordAlreadyExistsException();
  }
  // 外键约束 — foreign_key_violation (23503)
  if (code === '23503') {
    throw new ForeignKeyConstraintViolationException();
  }
  // 死锁 — deadlock_detected (40P01)
  if (code === '40P01') {
    throw new DeadlockDetectedException();
  }
  // 锁不可用 — lock_not_available (55P03)
  if (code === '55P03') {
    throw new LockWaitTimeoutException();
  }
  // 非空约束 — not_null_violation (23502)
  if (code === '23502') {
    throw new DataIntegrityViolationException('非空约束违反');
  }
  // 字段长度超限 — string_data_right_truncation (22001)
  if (code === '22001') {
    throw new DataIntegrityViolationException('字段长度超限');
  }
  // 字段值不合法 — invalid_text_representation (22P02)
  if (code === '22P02') {
    throw new DataIntegrityViolationException('字段值不合法');
  }
  // 未识别错误，包装为 Error 后抛出
  if (error instanceof Error) {
    throw error;
  }
  throw new Error(String(error));
}
