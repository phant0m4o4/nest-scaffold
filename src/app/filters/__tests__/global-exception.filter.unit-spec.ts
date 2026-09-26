import { ZodValidationException } from '@/app/exceptions/zod-validation.exception';
import { GlobalExceptionFilter } from '@/app/filters/global-exception.filter';
import { DataIntegrityViolationException } from '@/common/modules/database/common/repositories/exceptions/data-integrity-violation-exception';
import { DeadlockDetectedException } from '@/common/modules/database/common/repositories/exceptions/deadlock-detected-exception';
import { ForeignKeyConstraintViolationException } from '@/common/modules/database/common/repositories/exceptions/foreign-key-constraint-violation-exception';
import { LockWaitTimeoutException } from '@/common/modules/database/common/repositories/exceptions/lock-wait-timeout-exception';
import { RecordAlreadyExistsException } from '@/common/modules/database/common/repositories/exceptions/record-already-exists-exception';
import { RecordNotFoundException } from '@/common/modules/database/common/repositories/exceptions/record-not-found-exception';
import { RepositoryException } from '@/common/modules/database/common/repositories/exceptions/repository-exception';
import {
  HttpException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/** 构造带可断言 response 的 ArgumentsHost 测试替身 */
function buildHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockLogger: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockLogger = { error: vi.fn() };
    filter = new GlobalExceptionFilter(mockLogger as unknown as PinoLogger);
  });

  it.each([
    [new RecordNotFoundException(), 404, 'RECORD_NOT_FOUND', '记录不存在'],
    [
      new RecordAlreadyExistsException(),
      409,
      'RECORD_ALREADY_EXISTS',
      '记录已存在',
    ],
    [
      new ForeignKeyConstraintViolationException(),
      409,
      'FOREIGN_KEY_CONSTRAINT_VIOLATION',
      '外键约束冲突',
    ],
    [
      new DataIntegrityViolationException(),
      400,
      'DATA_INTEGRITY_VIOLATION',
      '数据完整性异常',
    ],
    [new DeadlockDetectedException(), 409, 'DEADLOCK_DETECTED', '检测到死锁'],
    [new LockWaitTimeoutException(), 503, 'LOCK_WAIT_TIMEOUT', '锁等待超时'],
  ])(
    '仓储异常映射为语义化状态码：%s',
    (exception, expectedStatus, expectedCode, expectedMessage) => {
      const { host, status, json } = buildHost();

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith({
        statusCode: expectedStatus,
        code: expectedCode,
        message: expectedMessage,
      });
    },
  );

  it('仓储基类异常兜底为 500，对外隐藏细节并记录日志', () => {
    const { host, status, json } = buildHost();

    filter.catch(new RepositoryException('内部细节'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'REPOSITORY_ERROR',
      message: '数据访问异常',
    });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it('ZodValidationException 的字段错误和约束参数保持兼容', () => {
    const { host, status, json } = buildHost();
    const result = z
      .object({ name: z.string().min(1) })
      .safeParse({ name: '' });
    if (result.success) throw new Error('预期校验失败');

    filter.catch(new ZodValidationException(result.error), host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        code: 'VALIDATION_FAILED',
        errors: [
          expect.objectContaining({
            field: 'name',
            code: 'too_small',
            params: { origin: 'string', minimum: 1, inclusive: true },
          }),
        ],
      }),
    );
  });

  it('Nest 内置 HttpException 按状态码补充机器可读 code', () => {
    const { host, status, json } = buildHost();

    filter.catch(new NotFoundException('资源不存在'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: '资源不存在',
    });
  });

  it('自定义错误码未携带状态码时仍使用异常的状态并丢弃额外字段', () => {
    const { host, status, json } = buildHost();

    filter.catch(
      new HttpException(
        { code: 'UPSTREAM_ERROR', message: '上游不可用', detail: '内部详情' },
        502,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
      message: '上游不可用',
    });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it('响应对象中的冲突状态码不能覆盖异常状态', () => {
    const { host, status, json } = buildHost();

    filter.catch(
      new HttpException(
        { statusCode: 200, code: 'UPSTREAM_ERROR', message: '上游不可用' },
        503,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      statusCode: 503,
      code: 'UPSTREAM_ERROR',
      message: '上游不可用',
    });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['请求不合法', '请求不合法'],
    [{ message: ['名称必填', '类型必填'] }, '名称必填; 类型必填'],
    [{ code: 'VALIDATION_FAILED', message: ['名称必填'] }, '名称必填'],
  ])('字符串与消息数组继续归一化为文案：%j', (raw, expectedMessage) => {
    const { host, status, json } = buildHost();

    filter.catch(new HttpException(raw, 422), host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      message: expectedMessage,
    });
  });

  it.each([
    { code: 500, message: { detail: '内部详情' } },
    { code: '', message: ['公开文案', { detail: '内部详情' }] },
  ])('非字符串错误码和文案不得作为对象透出：%j', (raw) => {
    const { host, status, json } = buildHost();
    const exception = new HttpException(raw, 400);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: exception.message,
    });
  });

  it('自定义字段错误只保留合法条目和约定字段', () => {
    const { host, json } = buildHost();

    filter.catch(
      new HttpException(
        {
          code: 'VALIDATION_FAILED',
          message: '校验失败',
          errors: [
            null,
            '内部详情',
            { field: 'name', code: 'invalid', message: { detail: '内部详情' } },
            {
              field: 'name',
              code: 'too_small',
              message: '名称过短',
              params: { minimum: 1 },
              detail: '内部详情',
            },
            { field: 'type', code: 'invalid', message: '类型错误', params: [] },
          ],
        },
        422,
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      message: '校验失败',
      errors: [
        {
          field: 'name',
          code: 'too_small',
          message: '名称过短',
          params: { minimum: 1 },
        },
        { field: 'type', code: 'invalid', message: '类型错误' },
      ],
    });
  });

  it('未知异常一律 500 且不泄露细节，原始异常记入日志', () => {
    const { host, status, json } = buildHost();
    const inputError = new Error('secret internal detail');

    filter.catch(inputError, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: inputError }),
      expect.any(String),
    );
  });
});
