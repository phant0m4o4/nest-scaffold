import { UnprocessableEntityException } from '@nestjs/common';
import type { ZodError } from 'zod';

/**
 * zod 校验失败异常
 *
 * 由全局 `I18nZodValidationPipe` 抛出；自身即携带统一的 422 响应体，
 * 由 Nest 默认异常层直接渲染，无需额外的异常过滤器：
 * `{ statusCode: 422, message: 'Validation Failed', errors: [{ field, message }] }`
 */
export class ZodValidationException extends UnprocessableEntityException {
  constructor(private readonly _zodError: ZodError) {
    super({
      statusCode: 422,
      message: 'Validation Failed',
      errors: _zodError.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  getZodError(): ZodError {
    return this._zodError;
  }
}
