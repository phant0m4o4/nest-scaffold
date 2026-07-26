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
 * - `message`：**用户级文案**，后端按请求语言渲染（schema 显式 message >
 *   项目文案目录 src/i18n/<lang>/validation.json > zod locale 兜底），
 *   前端可直接展示——校验规则与文案在后端同一 PR 内闭环，前端无需联动改动；
 * - `field` + `code` + `params`：机器可读、不随语言变化的结构化数据，
 *   供需要完全自定义文案/交互的客户端使用（如 t(`validation.${code}`, params)）。
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
