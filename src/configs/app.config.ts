import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

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
const environmentSchema = z.object({
  NODE_ENV: z.enum(EnvironmentEnum),
  APP_NAME: z.string().min(1),
  APP_PORT: z.coerce.number().int().optional(),
  APP_ADDRESS: z.string().min(1).optional(),
  APP_BASE_URL: z.string().min(1).optional(),
});

const appConfig = registerEnvAsConfig('app', environmentSchema, (env) => {
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
