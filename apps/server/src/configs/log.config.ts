import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { dirname, extname } from 'node:path';
import { z } from 'zod';

/**
 * 日志配置
 *
 * .env 示例：
 * LOG_FILE_ENABLE=false
 * LOG_FILE_DIR=/var/log/my-app  # 仅当 LOG_FILE_ENABLE 为 true 时必填
 */
const environmentSchema = z
  .object({
    LOG_FILE_ENABLE: z.stringbool().optional(),
    LOG_FILE_DIR: z.string().min(1).optional(),
    /** @deprecated 兼容旧配置；新项目使用 LOG_FILE_DIR */
    LOG_FILE_PATH: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (
      (env.LOG_FILE_ENABLE ?? false) &&
      !env.LOG_FILE_DIR &&
      !env.LOG_FILE_PATH
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_FILE_DIR'],
        message: 'LOG_FILE_ENABLE 为 true 时必填',
      });
    }
  });

const logConfig = registerEnvAsConfig('log', environmentSchema, (env) => ({
  logFileEnable: env.LOG_FILE_ENABLE ?? false,
  // 日志目录：优先使用 .env 配置，否则按项目根目录/logs 生成默认目录
  // 旧 LOG_FILE_PATH 若以 .log 结尾，按旧示例的“文件路径”语义取其父目录。
  logFileDir:
    env.LOG_FILE_DIR ??
    (env.LOG_FILE_PATH
      ? extname(env.LOG_FILE_PATH) === '.log'
        ? dirname(env.LOG_FILE_PATH)
        : env.LOG_FILE_PATH
      : `${process.cwd()}/logs`),
}));
export type LogConfigType = ConfigType<typeof logConfig>;
export default logConfig;
