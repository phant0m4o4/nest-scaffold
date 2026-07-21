import { UnprocessableEntityException } from '@nestjs/common';
import type { ZodError } from 'zod';

/** zod issue 中不属于约束参数的字段（path/message 另行表达，input 不对外泄露） */
const NON_PARAM_ISSUE_KEYS = new Set(['code', 'path', 'message', 'input']);

/**
 * 提取 issue 的约束参数（minimum / maximum / values / expected 等）
 * 供前端配合 code 做模板化文案渲染，如 t(`validation.${code}`, params)
 */
function extractIssueParams(
  issue: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(issue).filter(
    ([key]) => !NON_PARAM_ISSUE_KEYS.has(key),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * zod 校验失败异常
 *
 * 由全局 `I18nZodValidationPipe` 抛出；自身即携带统一错误信封：
 * `{ statusCode: 422, code: 'VALIDATION_FAILED', message, errors: [{ field, code, params?, message }] }`
 *
 * 字段定位（前后端契约）：
 * - `field` + `code` + `params`：机器可读、不随语言变化——**前端用户文案据此渲染**
 *   （前端知道字段 label 与 UI 语境，如 t(`validation.${code}`, params)）；
 * - `message`：按请求语言渲染的 zod 文案，定位是**开发调试与兜底展示**，
 *   不承诺终端用户级亲和度。
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
        params: extractIssueParams(issue as unknown as Record<string, unknown>),
        message: issue.message,
      })),
    });
  }

  getZodError(): ZodError {
    return this._zodError;
  }
}
