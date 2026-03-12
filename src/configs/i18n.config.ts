import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

/**
 * i18n 环境变量定义与配置映射
 *
 * - 通过 `registerEnvAsConfig` 进行验证与类型安全映射
 * - 翻译文件路径固定在 `I18nModule` 中，与 nest-cli.json assets 规则绑定，不通过配置暴露
 *
 * .env 示例：
 * I18N_FALLBACK_LANGUAGE=en
 */
class I18nEnvironmentVariables {
  @Expose()
  @IsString()
  @IsOptional()
  I18N_FALLBACK_LANGUAGE?: string;
}

const i18nConfig = registerEnvAsConfig(
  'i18n',
  I18nEnvironmentVariables,
  (env) => ({
    fallbackLanguage: env.I18N_FALLBACK_LANGUAGE ?? 'en',
  }),
);

export type I18nConfigType = ConfigType<typeof i18nConfig>;
export default i18nConfig;
