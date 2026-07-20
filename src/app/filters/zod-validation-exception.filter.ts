import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';

/**
 * Zod 校验异常过滤器
 *
 * 将 `ZodValidationPipe` 抛出的 `ZodValidationException` 统一转换为 422 响应：
 * `{ statusCode: 422, message: 'Validation Failed', errors: [{ field, message }] }`
 */
@Catch(ZodValidationException)
export class ZodValidationExceptionFilter implements ExceptionFilter {
  catch(exception: ZodValidationException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    // nestjs-zod 为同时兼容 zod v3/v4，将返回值声明为 unknown，此处收窄为 v4 的 ZodError
    const zodError = exception.getZodError() as ZodError;
    response.status(422).json({
      statusCode: 422,
      message: 'Validation Failed',
      errors: zodError.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
}
