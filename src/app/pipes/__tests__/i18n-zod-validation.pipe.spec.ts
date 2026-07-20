import { CreateDemoRequestDto } from '@/app/api/demo/dtos/create-demo-request.dto';
import { UpdateDemoRequestDto } from '@/app/api/demo/dtos/update-demo-request.dto';
import { ZodValidationException } from '@/app/exceptions/zod-validation.exception';
import type { ArgumentMetadata } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nZodValidationPipe } from '../i18n-zod-validation.pipe';

/** 构造 body 元数据（指向传入的 DTO 类） */
function buildBodyMetadata(metatype: unknown): ArgumentMetadata {
  return { type: 'body', metatype: metatype as ArgumentMetadata['metatype'] };
}

/** 模拟 I18nContext 解析出的请求语言 */
function mockRequestLang(lang: string | undefined) {
  vi.spyOn(I18nContext, 'current').mockReturnValue(
    (lang ? { lang } : undefined) as ReturnType<typeof I18nContext.current>,
  );
}

describe('I18nZodValidationPipe', () => {
  let pipe: I18nZodValidationPipe;

  beforeEach(() => {
    pipe = new I18nZodValidationPipe();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('合法请求应返回解析后的数据并剔除未声明字段', () => {
    mockRequestLang('zh-cn');
    const inputBody = { name: 'demo', type: 'TYPE_1', extra: 'x' };

    const actual = pipe.transform(
      inputBody,
      buildBodyMetadata(CreateDemoRequestDto),
    );

    expect(actual).toEqual({ name: 'demo', type: 'TYPE_1' });
  });

  it('请求语言为 zh-cn 时校验错误消息应为中文', () => {
    mockRequestLang('zh-cn');

    try {
      pipe.transform({ name: 1 }, buildBodyMetadata(CreateDemoRequestDto));
      expect.unreachable('应当抛出 ZodValidationException');
    } catch (error) {
      expect(error).toBeInstanceOf(ZodValidationException);
      const issues = (error as ZodValidationException).getZodError().issues;
      expect(issues[0].message).toContain('无效输入');
    }
  });

  it('请求语言为 en 或未解析出语言时应使用英文默认文案', () => {
    mockRequestLang(undefined);

    try {
      pipe.transform({ name: 1 }, buildBodyMetadata(CreateDemoRequestDto));
      expect.unreachable('应当抛出 ZodValidationException');
    } catch (error) {
      const issues = (error as ZodValidationException).getZodError().issues;
      expect(issues[0].message).toContain('Invalid input');
    }
  });

  it('schema 中显式书写的自定义消息应优先于 locale 文案', () => {
    mockRequestLang('en');

    try {
      pipe.transform(
        { createdAt: 'not-a-date', updatedAt: '2025-01-01 00:00:00' },
        buildBodyMetadata(UpdateDemoRequestDto),
      );
      expect.unreachable('应当抛出 ZodValidationException');
    } catch (error) {
      const issues = (error as ZodValidationException).getZodError().issues;
      const createdAtIssue = issues.find((i) => i.path[0] === 'createdAt');
      expect(createdAtIssue?.message).toBe('无效的日期时间');
    }
  });

  it('非 zod DTO 的参数应原样透传', () => {
    mockRequestLang('zh-cn');
    const inputValue = { anything: true };

    const actual = pipe.transform(inputValue, buildBodyMetadata(Object));

    expect(actual).toBe(inputValue);
  });
});
