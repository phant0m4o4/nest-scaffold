import { Injectable, PipeTransform } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 请求语言 → zod 官方 locale 错误映射
 * 与 `src/i18n/` 的语言目录保持对应；返回 undefined 时使用 zod 默认英文文案
 */
function resolveLocaleError(lang?: string): z.core.$ZodErrorMap | undefined {
  if (lang?.toLowerCase().startsWith('zh')) {
    return z.locales.zhCN().localeError;
  }
  return undefined;
}

/**
 * 带 i18n 的 zod 校验管道
 *
 * 对使用 `createZodDto` 声明的 DTO 自动校验 body/query/param，
 * 并按 `I18nContext` 解析出的请求语言（Query `?lang=` / Accept-Language / x-lang）
 * 渲染 zod 校验错误消息；schema 中显式书写的自定义消息优先于 locale 文案。
 * 校验失败抛出 `ZodValidationException`，由 `ZodValidationExceptionFilter` 统一转为 422。
 */
@Injectable()
export class I18nZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype as
      | { isZodDto?: boolean; schema?: z.ZodType }
      | undefined;
    if (!metatype?.isZodDto || !metatype.schema) {
      return value;
    }
    const lang = I18nContext.current()?.lang;
    const result = metatype.schema.safeParse(value, {
      error: resolveLocaleError(lang),
    });
    if (!result.success) {
      throw new ZodValidationException(result.error);
    }
    return result.data;
  }
}
