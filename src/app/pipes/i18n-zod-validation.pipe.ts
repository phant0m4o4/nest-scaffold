import { ZodValidationException } from '@/app/exceptions/zod-validation.exception';
import type { IZodDtoClass } from '@/common/utils/zod/create-zod-dto';
import { Injectable, PipeTransform } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
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

/** issue 中不参与文案插值的键（input 仅用于判断必填，不进入文案） */
const NON_ARG_ISSUE_KEYS = new Set(['code', 'path', 'message', 'input']);

/** 仅字符串化原始类型（数组递归连接）；对象等复杂值不进入文案 */
function stringifyArg(value: unknown, separator: string): string | undefined {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => stringifyArg(item, separator))
      .filter((item): item is string => item !== undefined);
    return parts.join(separator);
  }
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value);
    default:
      return undefined;
  }
}

/** 将 issue 的约束参数转为可插值的字符串参数（数组按语言习惯连接） */
function toTemplateArgs(
  issue: Record<string, unknown>,
  lang: string | undefined,
): Record<string, string> {
  const separator = lang?.toLowerCase().startsWith('zh') ? '、' : ', ';
  const args: Record<string, string> = {};
  for (const [key, value] of Object.entries(issue)) {
    if (NON_ARG_ISSUE_KEYS.has(key)) {
      continue;
    }
    const stringified = stringifyArg(value, separator);
    if (stringified !== undefined) {
      args[key] = stringified;
    }
  }
  return args;
}

/**
 * 动态拼接的翻译 key 无法满足全局翻译类型的字面量约束，
 * 以最小接口收窄 I18nContext 的能力面
 */
interface IDynamicTranslator {
  lang: string;
  t(key: string, options?: { args?: Record<string, string> }): unknown;
}

/**
 * 翻译指定 key；未命中（开发环境返回 key 本身 / 生产环境 throwOnMissingKey 抛错）
 * 一律视为 miss 返回 undefined，交由调用方降级
 */
function translateOrMiss(
  i18n: IDynamicTranslator,
  key: string,
  args?: Record<string, string>,
): string | undefined {
  try {
    const message = i18n.t(key, args ? { args } : undefined);
    return typeof message === 'string' && message !== key ? message : undefined;
  } catch {
    return undefined;
  }
}

/** 字段界面名称：优先完整路径映射，其次叶子字段名映射，最后回退原始路径 */
function resolveFieldLabel(
  i18n: IDynamicTranslator,
  path: PropertyKey[],
): string {
  const joined = path.map(String).join('.');
  if (joined === '') {
    return '';
  }
  const leaf = String(path[path.length - 1]);
  return (
    translateOrMiss(i18n, `validation.fields.${joined}`) ??
    (leaf !== joined
      ? translateOrMiss(i18n, `validation.fields.${leaf}`)
      : undefined) ??
    joined
  );
}

/**
 * 用项目文案目录（src/i18n/<lang>/validation.json）渲染用户级错误文案
 *
 * key 查找顺序：required（必填缺失特判）→ `<code>_<origin>`（如
 * too_small_string）→ `<code>` → default；全部未命中返回 undefined。
 */
function renderCatalogMessage(issue: z.core.$ZodRawIssue): string | undefined {
  const i18n = I18nContext.current() as unknown as
    IDynamicTranslator | undefined;
  if (!i18n || typeof i18n.t !== 'function') {
    return undefined;
  }
  const record = issue as unknown as Record<string, unknown>;
  const args = {
    ...toTemplateArgs(record, i18n.lang),
    field: resolveFieldLabel(i18n, issue.path ?? []),
  };

  const keys: string[] = [];
  if (issue.code === 'invalid_type' && record.input === undefined) {
    keys.push('validation.required');
  }
  if (typeof record.origin === 'string') {
    keys.push(`validation.${issue.code}_${record.origin}`);
  }
  keys.push(`validation.${issue.code}`, 'validation.default');

  for (const key of keys) {
    const message = translateOrMiss(i18n, key, args);
    if (message !== undefined) {
      return message;
    }
  }
  return undefined;
}

/**
 * 带 i18n 的 zod 校验管道
 *
 * 对使用 `createZodDto` 声明的 DTO 自动校验 body/query/param，
 * 错误文案按请求语言（Query `?lang=` / Accept-Language / x-lang）渲染，
 * 优先级从高到低：
 *
 * 1. schema 中显式书写的 message（zod 机制天然绕过 error map）；
 * 2. 项目文案目录 `src/i18n/<lang>/validation.json`（**用户级文案**：
 *    字段界面名称 + 约束参数插值，新增校验规则时在同一 PR 补充对应条目）；
 * 3. zod 官方 locale 文案（目录未命中或无 I18n 上下文时的调试兜底）。
 *
 * 校验失败抛出 `ZodValidationException`（自身携带统一的 422 响应体）。
 */
@Injectable()
export class I18nZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype as Partial<IZodDtoClass> | undefined;
    if (!metatype?.isZodDto || !metatype.schema) {
      return value;
    }
    const localeError = resolveLocaleError(I18nContext.current()?.lang);
    const errorMap: z.core.$ZodErrorMap = (issue) =>
      renderCatalogMessage(issue) ?? localeError?.(issue);
    const result = metatype.schema.safeParse(value, { error: errorMap });
    if (!result.success) {
      throw new ZodValidationException(result.error);
    }
    return result.data;
  }
}
