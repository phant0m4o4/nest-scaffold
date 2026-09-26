import { ZodValidationException } from '@/app/exceptions/zod-validation.exception';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/** 构造一个含嵌套字段错误的 ZodError */
function buildNestedError() {
  const result = z
    .object({ user: z.object({ email: z.string().min(5) }) })
    .safeParse({ user: { email: 'a' } });
  if (result.success) {
    throw new Error('预期校验失败');
  }
  return result.error;
}

describe('ZodValidationException', () => {
  it('自带 422 状态与统一响应体（嵌套字段路径以点号拼接）', () => {
    const exception = new ZodValidationException(buildNestedError());
    const response = exception.getResponse() as {
      statusCode: number;
      message: string;
      code: string;
      errors: Array<{
        field: string;
        code: string;
        params?: Record<string, unknown>;
        message: string;
      }>;
    };

    expect(exception.getStatus()).toBe(422);
    expect(response.statusCode).toBe(422);
    expect(response.message).toBe('Validation Failed');
    expect(response.code).toBe('VALIDATION_FAILED');
    expect(response.errors).toHaveLength(1);
    expect(response.errors[0].field).toBe('user.email');
    expect(response.errors[0].code).toBe('too_small');
    // 约束参数透传，供前端 t(`validation.${code}`, params) 模板化渲染用户文案
    expect(response.errors[0].params).toMatchObject({ minimum: 5 });
    // input 不得对外泄露
    expect(response.errors[0].params).not.toHaveProperty('input');
    expect(typeof response.errors[0].message).toBe('string');
  });

  it('getZodError() 透出原始 ZodError', () => {
    const error = buildNestedError();

    expect(new ZodValidationException(error).getZodError()).toBe(error);
  });
});
