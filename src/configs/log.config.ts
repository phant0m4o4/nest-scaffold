import { parseBooleanString } from '@/common/utils/parse-boolean-string';
import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { ConfigType } from '@nestjs/config';
import { Expose } from 'class-transformer';
import {
  IsBooleanString,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

/** 安全解析日志文件开关，解析失败时返回 false（用于 ValidateIf 等未校验场景） */
function parseLogFileEnable(value?: string): boolean {
  try {
    return parseBooleanString(value ?? 'false');
  } catch {
    return false;
  }
}

/**
 * 日志配置
 *
 * .env 示例：
 * LOG_FILE_ENABLE=false
 * LOG_FILE_PATH=/var/log/app.log  # 仅当 LOG_FILE_ENABLE 为 true 时必填
 */
class EnvironmentVariables {
  @Expose()
  @IsBooleanString()
  @IsOptional()
  LOG_FILE_ENABLE?: string;
  @Expose()
  @IsString()
  @IsOptional()
  @ValidateIf((object: EnvironmentVariables) =>
    parseLogFileEnable(object.LOG_FILE_ENABLE),
  )
  LOG_FILE_PATH?: string;
}

const logConfig = registerEnvAsConfig('log', EnvironmentVariables, (env) => ({
  logFileEnable: parseBooleanString(env.LOG_FILE_ENABLE ?? 'false'),
  // 日志文件路径：优先使用 .env 配置，否则按项目根目录/logs 生成默认路径
  logFilePath: env.LOG_FILE_PATH ?? `${process.cwd()}/logs`,
}));
export type LogConfigType = ConfigType<typeof logConfig>;
export default logConfig;
