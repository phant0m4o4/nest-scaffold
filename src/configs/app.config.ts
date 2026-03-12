import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * 应用基础配置
 *
 * .env 示例：
 * NODE_ENV=development
 * APP_NAME=sjhy_wallet_backend
 * APP_PORT=3000
 * APP_ADDRESS=127.0.0.1
 * APP_BASE_URL=http://127.0.0.1:3000
 */
class EnvironmentVariables {
  @Expose()
  @IsIn(Object.values(EnvironmentEnum))
  @IsNotEmpty()
  NODE_ENV: EnvironmentEnum;
  @Expose()
  @IsString()
  @IsNotEmpty()
  APP_NAME: string;
  @Expose()
  @IsInt()
  @IsOptional()
  APP_PORT?: number;
  @Expose()
  @IsString()
  @IsOptional()
  APP_ADDRESS?: string;
  @Expose()
  @IsString()
  @IsOptional()
  APP_BASE_URL?: string;
}

const appConfig = registerEnvAsConfig('app', EnvironmentVariables, (env) => {
  const port = env.APP_PORT ?? 3000;
  const address = env.APP_ADDRESS ?? '127.0.0.1';
  const baseUrl = env.APP_BASE_URL ?? `http://${address}:${port}`;
  return {
    name: env.APP_NAME,
    port,
    address,
    baseUrl,
  };
});
export type AppConfigType = ConfigType<typeof appConfig>;
export default appConfig;
