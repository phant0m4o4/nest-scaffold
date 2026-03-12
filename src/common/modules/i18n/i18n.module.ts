import { EnvironmentEnum } from '@/common/enums/environment.enum';
import i18nConfig, { I18nConfigType } from '@/configs/i18n.config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nValidationError,
  I18nValidationExceptionFilter,
  I18nValidationPipe,
  I18nModule as NestI18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import path from 'node:path';
import { formatValidationErrors } from './utils/format-validation-errors';

/** 翻译文件目录（相对当前模块），与 nest-cli.json assets 规则保持一致 */
const TRANSLATIONS_PATH = path.join(__dirname, '..', '..', '..', 'i18n');

/**
 * I18n 模块
 *
 * 封装 nestjs-i18n，提供：
 * - 全局 I18nService 注入（翻译服务）
 * - 语言解析器（Query `?lang=` / Accept-Language / x-lang Header）
 * - 全局 I18nValidationPipe（DTO 校验消息国际化）
 * - 全局 I18nValidationExceptionFilter（422 统一错误响应）
 * - 开发环境自动 watch 翻译文件变更
 *
 * 全局性说明：
 * - `NestI18nModule.forRootAsync()` 内部已标记 `@Global()`，
 *   因此 `I18nService` 在整个应用中全局可用，业务模块无需重复导入。
 * - `APP_PIPE` / `APP_FILTER` 通过 NestJS 全局 token 注册，天然对所有路由生效。
 * - 只需在 `AppModule` 中导入一次 `I18nModule` 即可。
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Module({
  imports: [
    ConfigModule.forFeature(i18nConfig),
    NestI18nModule.forRootAsync({
      inject: [ConfigService],
      imports: [ConfigModule.forFeature(i18nConfig)],
      useFactory: (configService: ConfigService) => {
        const isDev = process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT;
        const { fallbackLanguage } =
          configService.getOrThrow<I18nConfigType>('i18n');
        const i18nPath = TRANSLATIONS_PATH;
        return {
          fallbackLanguage,
          loaderOptions: {
            path: i18nPath,
            watch: isDev,
          },
          logging: isDev,
          throwOnMissingKey: !isDev,
        };
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
  ],
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new I18nValidationPipe({
          transform: true,
          stopAtFirstError: true,
        }),
    },
    {
      provide: APP_FILTER,
      useFactory: () =>
        new I18nValidationExceptionFilter({
          errorHttpStatusCode: 422,
          responseBodyFormatter: (_host, _exc, formattedErrors) => {
            return {
              statusCode: 422,
              message: 'Validation Failed',
              errors: formattedErrors,
            };
          },
          errorFormatter: (errors: I18nValidationError[]) => {
            return formatValidationErrors(errors);
          },
        }),
    },
  ],
  exports: [NestI18nModule],
})
export class I18nModule {}
