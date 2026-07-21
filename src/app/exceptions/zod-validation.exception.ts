import { UnprocessableEntityException } from '@nestjs/common';
import type { ZodError } from 'zod';

/**
 * zod 校验失败异常
 *
 * 由全局 `I18nZodValidationPipe` 抛出；自身即携带统一错误信封：
 * `{ statusCode: 422, code: 'VALIDATION_FAILED', message, errors: [{ field, code, message }] }`
 * 其中 errors[].code 透传 zod 的 issue code（too_small / invalid_type 等），
 * 供客户端做机器可读的分支处理（message 会随请求语言变化，code 不变）。
 */
export class ZodValidationException extends UnprocessableEntityException {
  constructor(private readonly _zodError: ZodError) {
    super({
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      message: 'Validation Failed',
      errors: _zodError.issues.map((issue) => ({
        field: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    });
  }

  getZodError(): ZodError {
    return this._zodError;
  }
}
