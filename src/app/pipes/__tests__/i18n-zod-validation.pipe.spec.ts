import { CreateDemoRequestDto } from '@/app/api/demo/dtos/create-demo-request.dto';
import { ZodValidationException } from '@/app/exceptions/zod-validation.exception';
import { createZodDto } from '@/common/utils/zod/create-zod-dto';
import type { ArgumentMetadata } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { I18nZodValidationPipe } from '../i18n-zod-validation.pipe';

/** 带显式自定义错误消息的测试 DTO，用于验证消息优先级 */
class CustomMessageDto extends createZodDto(
  z.object({
    value: z.string().min(1, { message: '自定义消息' }),
  }),
) {}

/** 构造 body 元数据（指向传入的 DTO 类） */
function buildBodyMetadata(metatype: unknown): ArgumentMetadata {
  return { type: 'body', metatype: metatype as ArgumentMetadata['metatype'] };
}

/** 模拟 I18nContext 解析出的请求语言（无 t 方法 → 文案目录不可用） */
function mockRequestLang(lang: string | undefined) {
  vi.spyOn(I18nContext, 'current').mockReturnValue(
    (lang ? { lang } : undefined) as ReturnType<typeof I18nContext.current>,
  );
}

/** 模拟带翻译能力的 I18nContext：未命中 key 时按 nestjs-i18n 开发环境行为返回 key 本身 */
function mockI18nCatalog(lang: string, translations: Record<string, string>) {
  vi.spyOn(I18nContext, 'current').mockReturnValue({
    lang,
    t: (key: string, options?: { args?: Record<string, string> }) => {
      const template = translations[key];
      if (template === undefined) {
        return key;
      }
      return template.replace(
        /\{(\w+)\}/g,
        (_, name: string) => options?.args?.[name] ?? '',
      );
    },
  } as unknown as ReturnType<typeof I18nContext.current>);
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

  it('文案目录命中时渲染用户级文案（字段界面名称 + 参数插值）', () => {
    mockI18nCatalog('zh-cn', {
      'validation.fields.name': '名称',
      'validation.too_small_string': '{field}至少需要 {minimum} 个字符',
    });

    try {
      pipe.transform(
        { name: '', type: 'TYPE_1' },
        buildBodyMetadata(CreateDemoRequestDto),
      );
      expect.unreachable('应当抛出 ZodValidationException');
    } catch (error) {
      const issues = (error as ZodValidationException).getZodError().issues;
      expect(issues[0].message).toBe('名称至少需要 1 个字符');
    }
  });

  it('必填字段缺失时优先使用 required 文案', () => {
    mockI18nCatalog('zh-cn', {
      'validation.fields.name': '名称',
      'validation.required': '{field}为必填项',
    });

    try {
      pipe.transform(
        { type: 'TYPE_1' },
        buildBodyMetadata(CreateDemoRequestDto),
      );
      expect.unreachable('应当抛出 ZodValidationException');
    } catch (error) {
      const issues = (error as ZodValidationException).getZodError().issues;
      expect(issues[0].message).toBe('名称为必填项');
    }
  });

  it('字段名未在目录登记时回退为原始字段路径', () => {
    mockI18nCatalog('zh-cn', {
      'validation.too_small_string': '{field}至少需要 {minimum} 个字符',
    });

    try {
      pipe.transform(
        { name: '', type: 'TYPE_1' },
        buildBodyMetadata(CreateDemoRequestDto),
      );
      expect.unreachable('应当抛出 ZodValidationException');
    } catch (error) {
      const issues = (error as ZodValidationException).getZodError().issues;
      expect(issues[0].message).toBe('name至少需要 1 个字符');
    }
  });

  it('文案目录未命中时回退 zod locale 文案', () => {
    mockI18nCatalog('zh-cn', {});

    try {
      pipe.transform(
        { name: 1, type: 'TYPE_1' },
        buildBodyMetadata(CreateDemoRequestDto),
      );
      expect.unreachable('应当抛出 ZodValidationException');
    } catch (error) {
      const issues = (error as ZodValidationException).getZodError().issues;
      expect(issues[0].message).toContain('无效输入');
    }
  });

  it('schema 中显式书写的自定义消息优先级最高（高于文案目录与 locale）', () => {
    mockI18nCatalog('zh-cn', {
      'validation.too_small_string': '{field}至少需要 {minimum} 个字符',
    });

    try {
      pipe.transform({ value: '' }, buildBodyMetadata(CustomMessageDto));
      expect.unreachable('应当抛出 ZodValidationException');
    } catch (error) {
      const issues = (error as ZodValidationException).getZodError().issues;
      expect(issues[0].message).toBe('自定义消息');
    }
  });

  it('非 zod DTO 的参数应原样透传', () => {
    mockRequestLang('zh-cn');
    const inputValue = { anything: true };

    const actual = pipe.transform(inputValue, buildBodyMetadata(Object));

    expect(actual).toBe(inputValue);
  });
});
