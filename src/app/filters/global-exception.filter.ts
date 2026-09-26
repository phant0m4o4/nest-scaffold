import { DataIntegrityViolationException } from '@/common/modules/database/common/repositories/exceptions/data-integrity-violation-exception';
import { DeadlockDetectedException } from '@/common/modules/database/common/repositories/exceptions/deadlock-detected-exception';
import { ForeignKeyConstraintViolationException } from '@/common/modules/database/common/repositories/exceptions/foreign-key-constraint-violation-exception';
import { LockWaitTimeoutException } from '@/common/modules/database/common/repositories/exceptions/lock-wait-timeout-exception';
import { RecordAlreadyExistsException } from '@/common/modules/database/common/repositories/exceptions/record-already-exists-exception';
import { RecordNotFoundException } from '@/common/modules/database/common/repositories/exceptions/record-not-found-exception';
import { RepositoryException } from '@/common/modules/database/common/repositories/exceptions/repository-exception';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/** 统一错误信封中的单条字段错误 */
interface IErrorItem {
  field: string;
  code: string;
  message: string;
  params?: Record<string, unknown>;
}

/** 统一错误信封：所有非 2xx 响应都是这个形状 */
interface IErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  errors?: IErrorItem[];
}

/** 仓储异常 → HTTP 语义映射表（顺序即匹配顺序，子类在前） */
const REPOSITORY_EXCEPTION_MAP: ReadonlyArray<
  readonly [new (...args: never[]) => RepositoryException, number, string]
> = [
  [RecordNotFoundException, HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND'],
  [RecordAlreadyExistsException, HttpStatus.CONFLICT, 'RECORD_ALREADY_EXISTS'],
  [
    ForeignKeyConstraintViolationException,
    HttpStatus.CONFLICT,
    'FOREIGN_KEY_CONSTRAINT_VIOLATION',
  ],
  [
    DataIntegrityViolationException,
    HttpStatus.BAD_REQUEST,
    'DATA_INTEGRITY_VIOLATION',
  ],
  [DeadlockDetectedException, HttpStatus.CONFLICT, 'DEADLOCK_DETECTED'],
  [
    LockWaitTimeoutException,
    HttpStatus.SERVICE_UNAVAILABLE,
    'LOCK_WAIT_TIMEOUT',
  ],
];

/** 常见 HTTP 状态码 → 机器可读错误码 */
const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * 全局异常过滤器：所有异常统一为一个错误信封
 *
 * `{ statusCode, code, message, errors?: [{ field, code, message }] }`
 *
 * - HttpException 状态以 getStatus() 为准，只保留统一信封声明的字段；
 * - 自定义错误码与字段错误（如 ZodValidationException）校验后保留；
 * - 其余 HttpException（Nest 内置 404/403 等）按状态码补充机器可读 code；
 * - 仓储异常（RepositoryException 体系）按映射表转为语义化状态码
 *   （记录不存在 404、唯一/外键/死锁冲突 409、数据完整性 400、锁等待超时 503）；
 * - 未知异常一律 500，对外隐藏细节，原始异常记入错误日志。
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(GlobalExceptionFilter.name)
    private readonly _logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const envelope = this._normalize(exception);
    if (envelope.statusCode >= 500) {
      this._logger.error(
        { event: 'unhandled_exception', error: exception },
        '异常已转换为统一错误响应',
      );
    }
    response.status(envelope.statusCode).json(envelope);
  }

  private _normalize(exception: unknown): IErrorEnvelope {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const payload =
        typeof raw === 'object' && raw !== null
          ? (raw as Record<string, unknown>)
          : undefined;
      const rawMessage = typeof raw === 'string' ? raw : payload?.message;
      const message =
        typeof rawMessage === 'string'
          ? rawMessage
          : Array.isArray(rawMessage) &&
              rawMessage.every((item) => typeof item === 'string')
            ? rawMessage.join('; ')
            : exception.message;
      const errors = this._normalizeErrors(payload?.errors);
      return {
        statusCode: status,
        code:
          typeof payload?.code === 'string' && payload.code.length > 0
            ? payload.code
            : (CODE_BY_STATUS[status] ?? `HTTP_${status}`),
        message,
        ...(errors ? { errors } : {}),
      };
    }

    for (const [type, status, code] of REPOSITORY_EXCEPTION_MAP) {
      if (exception instanceof type) {
        return { statusCode: status, code, message: exception.message };
      }
    }
    if (exception instanceof RepositoryException) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'REPOSITORY_ERROR',
        message: '数据访问异常',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
  }

  private _normalizeErrors(raw: unknown): IErrorItem[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const errors: IErrorItem[] = [];
    for (const item of raw as unknown[]) {
      if (typeof item !== 'object' || item === null) continue;
      const { field, code, message, params } = item as Record<string, unknown>;
      if (
        typeof field !== 'string' ||
        typeof code !== 'string' ||
        typeof message !== 'string'
      ) {
        continue;
      }
      errors.push({
        field,
        code,
        message,
        ...(typeof params === 'object' &&
        params !== null &&
        !Array.isArray(params)
          ? { params: params as Record<string, unknown> }
          : {}),
      });
    }
    return errors;
  }
}
