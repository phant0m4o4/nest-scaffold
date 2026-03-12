import { DataIntegrityViolationException } from '../exceptions/data-integrity-violation-exception';
import { DeadlockDetectedException } from '../exceptions/deadlock-detected-exception';
import { ForeignKeyConstraintViolationException } from '../exceptions/foreign-key-constraint-violation-exception';
import { LockWaitTimeoutException } from '../exceptions/lock-wait-timeout-exception';
import { RecordAlreadyExistsException } from '../exceptions/record-already-exists-exception';

/** MySQL 错误对象的类型安全访问结构 */
interface IMysqlErrorLike {
  code?: string;
  errno?: number;
  cause?: {
    code?: string;
    errno?: number;
  };
}

/**
 * 判断未知值是否具有 MySQL 错误的结构特征
 */
function isMysqlErrorLike(error: unknown): error is IMysqlErrorLike {
  return typeof error === 'object' && error !== null;
}

/**
 * 从 MySQL 错误中提取 code 和 errno
 *
 * MySQL 错误可能直接携带 code/errno，也可能嵌套在 cause 属性内，
 * 此方法统一提取，优先使用 cause 层级的值。
 */
function extractMysqlErrorIdentifiers(error: unknown): {
  code: string | undefined;
  errno: number | undefined;
} {
  if (!isMysqlErrorLike(error)) {
    return { code: undefined, errno: undefined };
  }
  const code = error.cause?.code ?? error.code;
  const errno = error.cause?.errno ?? error.errno;
  return { code, errno };
}

/**
 * 根据 MySQL 错误信息映射为领域异常并抛出
 *
 * 统一在数据访问层使用该方法来将 MySQL 错误转换为更易理解的领域异常。
 * 该方法不会返回，始终抛出异常（never）。
 */
export function mapMysqlErrorAndThrow(error: unknown): never {
  const { code, errno } = extractMysqlErrorIdentifiers(error);
  // 唯一约束 — ER_DUP_ENTRY (1062)
  if (code === 'ER_DUP_ENTRY' || errno === 1062) {
    throw new RecordAlreadyExistsException();
  }
  // 外键约束 — ER_NO_REFERENCED_ROW_2 (1452) / ER_ROW_IS_REFERENCED_2 (1451)
  if (
    code === 'ER_NO_REFERENCED_ROW_2' ||
    errno === 1452 ||
    code === 'ER_ROW_IS_REFERENCED_2' ||
    errno === 1451
  ) {
    throw new ForeignKeyConstraintViolationException();
  }
  // 死锁 — ER_LOCK_DEADLOCK (1213)
  if (code === 'ER_LOCK_DEADLOCK' || errno === 1213) {
    throw new DeadlockDetectedException();
  }
  // 锁等待超时 — ER_LOCK_WAIT_TIMEOUT (1205)
  if (code === 'ER_LOCK_WAIT_TIMEOUT' || errno === 1205) {
    throw new LockWaitTimeoutException();
  }
  // 非空约束 — ER_BAD_NULL_ERROR (1048)
  if (code === 'ER_BAD_NULL_ERROR' || errno === 1048) {
    throw new DataIntegrityViolationException('非空约束违反');
  }
  // 字段长度超限 — ER_DATA_TOO_LONG (1406)
  if (code === 'ER_DATA_TOO_LONG' || errno === 1406) {
    throw new DataIntegrityViolationException('字段长度超限');
  }
  // 字段值不合法 — ER_TRUNCATED_WRONG_VALUE (1366)
  if (code === 'ER_TRUNCATED_WRONG_VALUE' || errno === 1366) {
    throw new DataIntegrityViolationException('字段值不合法');
  }
  // 未识别错误，包装为 Error 后抛出
  if (error instanceof Error) {
    throw error;
  }
  throw new Error(String(error));
}
