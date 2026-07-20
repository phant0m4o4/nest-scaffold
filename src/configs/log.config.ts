import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 日志配置
 *
 * .env 示例：
 * LOG_FILE_ENABLE=false
 * LOG_FILE_PATH=/var/log/app.log  # 仅当 LOG_FILE_ENABLE 为 true 时必填
 */
const environmentSchema = z
  .object({
    LOG_FILE_ENABLE: z.stringbool().optional(),
    LOG_FILE_PATH: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if ((env.LOG_FILE_ENABLE ?? false) && !env.LOG_FILE_PATH) {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_FILE_PATH'],
        message: 'LOG_FILE_ENABLE 为 true 时必填',
      });
    }
  });

const logConfig = registerEnvAsConfig('log', environmentSchema, (env) => ({
  logFileEnable: env.LOG_FILE_ENABLE ?? false,
  // 日志文件路径：优先使用 .env 配置，否则按项目根目录/logs 生成默认路径
  logFilePath: env.LOG_FILE_PATH ?? `${process.cwd()}/logs`,
}));
export type LogConfigType = ConfigType<typeof logConfig>;
export default logConfig;
