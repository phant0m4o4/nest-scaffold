/**
 * NestJS i18n 模块类型声明文件
 * 用于扩展 nestjs-i18n 库的类型定义，支持自定义翻译内容
 * 使用方法: 在项目根目录下创建一个名为 nestjs-i18n.d.ts 的文件，并复制以下内容
 * tsconfig.json 中添加 如下配置 以支持 导入 JSON 文件
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
 */

// 导入英文翻译文件作为类型参考
import { ArgumentsHost, OnModuleDestroy } from '@nestjs/common';
import 'nestjs-i18n';
import {
  I18nLoader,
  I18nOptions,
  I18nTranslation,
  I18nTranslator,
  I18nValidationError,
  IfAnyOrNever,
  Path,
  PathValue,
  TranslateOptions,
} from 'nestjs-i18n';
import { BehaviorSubject, Observable } from 'rxjs';
import { Logger } from 'winston';

/**
 * 自定义翻译内容类型定义
 * 包含所有翻译命名空间的结构
 */
type I18nTranslations = {
  common: typeof import('@/i18n/en/common.json');
  validation: typeof import('@/i18n/en/validation.json');
  error: typeof import('@/i18n/en/error.json');
};

/**
 * 翻译路径类型，用于类型安全的翻译键访问
 */
type I18nPath = Path<I18nTranslations>;

/**
 * 扩展 nestjs-i18n 模块的类型定义
 */
declare module 'nestjs-i18n' {
  /**
   * i18n 服务类声明
   * 负责处理国际化翻译的核心服务
   * @template K 翻译内容的类型参数
   */
  export declare class I18nService<K = I18nTranslations>
    implements I18nTranslator<K>, OnModuleDestroy
  {
    /** i18n 配置选项 */
    protected readonly i18nOptions: I18nOptions;
    /** 日志记录器 */
    private readonly logger;
    /** 翻译加载器 */
    private readonly loader;
    /** 支持的语言列表主题 */
    private readonly languagesSubject;
    /** 翻译内容主题 */
    private readonly translationsSubject;
    /** 支持的语言列表 */
    private supportedLanguages;
    /** 翻译内容缓存 */
    private translations;
    /** 复数规则 */
    private pluralRules;
    /** 取消订阅函数 */
    private unsubscribe;

    /**
     * 构造函数
     * @param i18nOptions - i18n 配置选项
     * @param translations - 翻译内容观察者
     * @param supportedLanguages - 支持语言列表观察者
     * @param logger - 日志记录器
     * @param loader - 翻译加载器
     * @param languagesSubject - 语言列表主题
     * @param translationsSubject - 翻译内容主题
     */
    constructor(
      i18nOptions: I18nOptions,
      translations: Observable<I18nTranslation>,
      supportedLanguages: Observable<string[]>,
      logger: Logger,
      loader: I18nLoader,
      languagesSubject: BehaviorSubject<string[]>,
      translationsSubject: BehaviorSubject<I18nTranslation>,
    );

    /**
     * 模块销毁时的清理工作
     */
    onModuleDestroy(): void;

    /**
     * 翻译指定键的内容
     * @template P 翻译路径类型
     * @template R 返回类型
     * @param key - 翻译键
     * @param options - 翻译选项
     * @returns 翻译后的内容
     */
    translate<P extends Path<K> = any, R = PathValue<K, P>>(
      key: P,
      options?: TranslateOptions,
    ): IfAnyOrNever<R, string, R>;

    /**
     * 获取回退语言
     */
    private getFallbackLanguage;

    /**
     * 翻译方法的简写形式
     * @template P 翻译路径类型
     * @template R 返回类型
     * @param key - 翻译键
     * @param options - 翻译选项
     * @returns 翻译后的内容
     */
    t<P extends Path<K> = any, R = PathValue<K, P>>(
      key: P,
      options?: TranslateOptions,
    ): IfAnyOrNever<R, string, R>;

    /**
     * 获取支持的语言列表
     * @returns 支持的语言代码数组
     */
    getSupportedLanguages(): string[];

    /**
     * 获取所有翻译内容
     * @returns 翻译内容对象
     */
    getTranslations(): I18nTranslation;

    /**
     * 刷新翻译内容
     * @param translations - 新的翻译内容
     * @param languages - 新的支持语言列表
     */
    refresh(
      translations?: I18nTranslation | Observable<I18nTranslation>,
      languages?: string[] | Observable<string[]>,
    ): Promise<void>;

    /**
     * Handlebars 模板引擎辅助函数
     * @template P 翻译路径类型
     * @param key - 翻译键
     * @param args - 模板参数
     * @param options - 模板选项
     * @returns 翻译后的内容
     */
    hbsHelper: <P extends Path<K> = any>(
      key: P,
      args: any,
      options: any,
    ) => IfAnyOrNever<PathValue<K, P>, string, PathValue<K, P>>;

    /**
     * 翻译对象内容
     */
    private translateObject;

    /**
     * 解析语言代码
     * @param lang - 语言代码
     * @returns 解析后的语言代码
     */
    resolveLanguage(lang: string): string;

    /**
     * 获取复数规则对象
     */
    private getPluralObject;

    /**
     * 获取嵌套翻译内容
     */
    private getNestedTranslations;

    /**
     * 验证翻译内容
     * @param value - 要验证的值
     * @param options - 验证选项
     * @returns 验证错误列表
     */
    validate(
      value: any,
      options?: TranslateOptions,
    ): Promise<I18nValidationError[]>;
  }

  /**
   * i18n 上下文类声明
   * 用于在请求上下文中管理翻译状态
   * @template K 翻译内容的类型参数
   */
  export declare class I18nContext<
    K = I18nTranslations,
  > implements I18nTranslator<K> {
    /** 当前语言代码 */
    readonly lang: string;
    /** i18n 服务实例 */
    readonly service: I18nService<K>;
    /** 静态存储 */
    private static storage;
    /** 静态计数器 */
    private static counter;
    /** 上下文 ID */
    readonly id: number;

    /**
     * 获取当前 i18n 上下文
     */
    get i18n(): I18nContext<K> | undefined;

    /**
     * 构造函数
     * @param lang - 语言代码
     * @param service - i18n 服务实例
     */
    constructor(lang: string, service: I18nService<K>);

    /**
     * 翻译指定键的内容
     * @template P 翻译路径类型
     * @template R 返回类型
     * @param key - 翻译键
     * @param options - 翻译选项
     * @returns 翻译后的内容
     */
    translate<P extends Path<K> = any, R = PathValue<K, P>>(
      key: P,
      options?: TranslateOptions,
    ): IfAnyOrNever<R, string, R>;

    /**
     * 翻译方法的简写形式
     * @template P 翻译路径类型
     * @template R 返回类型
     * @param key - 翻译键
     * @param options - 翻译选项
     * @returns 翻译后的内容
     */
    t<P extends Path<K> = any, R = PathValue<K, P>>(
      key: P,
      options?: TranslateOptions,
    ): IfAnyOrNever<R, string, R>;

    /**
     * 验证翻译内容
     * @param value - 要验证的值
     * @param options - 验证选项
     * @returns 验证错误列表
     */
    validate(
      value: any,
      options?: TranslateOptions,
    ): Promise<I18nValidationError[]>;

    /**
     * 创建同步上下文
     * @param ctx - 上下文对象
     * @param next - 下一个处理函数
     */
    static create(ctx: I18nContext, next: (...args: any[]) => void): void;

    /**
     * 创建异步上下文
     * @template T 返回类型
     * @param ctx - 上下文对象
     * @param next - 下一个异步处理函数
     * @returns 处理结果
     */
    static createAsync<T>(
      ctx: I18nContext,
      next: (...args: any[]) => Promise<T>,
    ): Promise<T>;

    /**
     * 获取当前上下文
     * @template K 翻译内容的类型参数
     * @param context - 执行上下文
     * @returns 当前 i18n 上下文或 undefined
     */
    static current<K = Record<string, unknown>>(
      context?: ArgumentsHost,
    ): I18nContext<K> | undefined;
  }
}
