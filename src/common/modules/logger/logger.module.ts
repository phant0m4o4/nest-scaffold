import { EnvironmentEnum } from '@/common/enums/environment.enum';
import logConfig, { LogConfigType } from '@/configs/log.config';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * 构建 pino-roll 文件落盘 transport 配置
 * @description pino-roll 是 pino 官方维护的按时间/大小滚动写文件 transport
 * @param filePath 日志文件基础路径（目录+基名），实际文件会追加日期/序号后缀
 * @returns pino transport 配置对象
 */
function _buildFileTransportOptions(filePath: string): object {
  return {
    target: 'pino-roll',
    options: {
      // 日志文件基础路径
      file: filePath,
      // 轮转频率：每天生成一个新文件
      frequency: 'daily',
      // 单个文件大小上限，超过则切分新文件（支持 'k'/'m'/'g'）
      size: '20m',
      // 目录不存在时自动创建
      mkdir: true,
      limit: {
        // 最多保留的文件数量（超过后自动清理最旧的）
        count: 365,
        // 同时移除目录中不匹配命名规则的其他日志文件
        removeOtherLogFiles: true,
      },
      // 文件名中的日期格式（date-fns 格式串），如 app.2024-01-15.log
      dateFormat: 'yyyy-MM-dd',
    },
  };
}

/**
 * 构建 pino-pretty 控制台 transport 配置
 * @description 仅在开发/测试环境使用，生产环境禁用以保证性能
 * @returns pino-pretty transport 配置对象
 */
function _buildPrettyTransportOptions(): object {
  return {
    level: 'debug',
    target: 'pino-pretty',
    options: {
      // 启用彩色输出，便于区分日志级别
      colorize: true,
      // 时间格式：SYS 表示使用系统时区
      translateTime: 'SYS:mm/dd/yyyy, HH:MM:ss.l',
      // 隐藏冗余字段，减轻控制台噪音
      ignore: 'hostname,pid,context,req,res,responseTime',
      // 自定义消息模板：仅在字段存在时输出对应部分，避免空白占位
      // 输出示例：[AppService] GET /api/users 200 Hello - 12 ms (uuid)
      messageFormat:
        '{if context}[{context}] {end}' +
        '{if req.method}{req.method} {req.url} {end}' +
        '{if res.statusCode} {res.statusCode} {end}' +
        ' {msg}' +
        '{if req.id} ({req.id}){end}' +
        '{if responseTime} - {responseTime} ms{end}',
      // destination: 2 表示输出到 stderr，避免与 stdout 的正常输出混淆
      destination: 2,
    },
  };
}

/**
 * 构建开发/测试环境的 pinoHttp 配置片段
 * @description debug 级别 + pretty 控制台输出 + 可选文件落盘
 * @param logFileEnable 是否同时写入日志文件
 * @param logFilePath 日志文件路径
 * @returns pinoHttp 的 spread 配置片段
 */
function _buildDevConfig(logFileEnable: boolean, logFilePath: string): object {
  return {
    // 开发环境使用最低级别 debug，便于排障
    level: 'debug',
    transport: {
      targets: [
        // 控制台 pretty 输出（始终启用）
        _buildPrettyTransportOptions(),
        // 文件落盘（由 LOG_FILE_ENABLE 控制，便于比对控制台与落盘内容）
        ...(logFileEnable
          ? [{ level: 'debug', ..._buildFileTransportOptions(logFilePath) }]
          : []),
      ],
    },
  };
}

/**
 * 构建生产环境的 pinoHttp 配置片段
 * @description info 级别 + 结构化 JSON 输出 + 敏感字段脱敏 + 可选文件落盘
 * @param logFileEnable 是否同时写入日志文件
 * @param logFilePath 日志文件路径
 * @returns pinoHttp 的 spread 配置片段
 */
function _buildProdConfig(logFileEnable: boolean, logFilePath: string): object {
  return {
    // 生产环境使用 info 级别，减少日志量
    level: 'info',
    // 敏感字段脱敏：在日志中自动替换为 [Redacted]
    redact: {
      paths: [
        'req.headers.authorization', // Bearer Token
        'req.headers.cookie', // Cookie
        'res.headers["set-cookie"]', // Set-Cookie 响应头
        'password', // 密码字段
      ],
    },
    transport: {
      targets: [
        // 控制台输出结构化 JSON（destination: 1 = stdout）
        { level: 'info', target: 'pino/file', options: { destination: 1 } },
        // 文件落盘（由 LOG_FILE_ENABLE 控制）
        ...(logFileEnable
          ? [{ level: 'info', ..._buildFileTransportOptions(logFilePath) }]
          : []),
      ],
    },
  };
}

/**
 * 日志模块
 * @description 封装 nestjs-pino，根据运行环境自动选择日志策略：
 *   - 开发/测试环境：debug 级别 + pino-pretty 彩色控制台
 *   - 生产环境：info 级别 + 结构化 JSON + 敏感字段脱敏
 *   - 所有环境：可选通过 LOG_FILE_ENABLE 启用 pino-roll 文件落盘
 *
 * 各业务模块通过 @InjectPinoLogger() 注入即可使用。
 * @see README.md 查看完整使用示例与配置说明
 */
@Module({
  exports: [PinoLoggerModule],
})
export class LoggerModule {
  /**
   * 创建动态日志模块
   * @param options 模块配置
   * @param options.name 应用名称，用于日志文件默认基名（如 logs/my-app.log），默认 'app'
   * @returns 配置好的动态模块
   */
  static forRoot(options: { name?: string } = {}): DynamicModule {
    const { name } = options;

    return {
      // 不需要设置为全局模块因为 使用的 PinoLoggerModule 是全局模块
      module: LoggerModule,
      imports: [
        PinoLoggerModule.forRootAsync({
          // 注册日志配置（LOG_FILE_ENABLE、LOG_FILE_PATH）
          imports: [ConfigModule.forFeature(logConfig)],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            // 判断当前运行环境
            const env = process.env.NODE_ENV;
            const isDev = env === EnvironmentEnum.DEVELOPMENT;
            const isTest = env === EnvironmentEnum.TEST;
            const isProd = env === EnvironmentEnum.PRODUCTION;
            // 读取日志配置
            const logCfg = configService.getOrThrow<LogConfigType>('log');
            const logFileEnable = logCfg.logFileEnable;
            // 日志文件完整路径：logFilePath（目录） + name（文件基名）
            const logDir = logCfg.logFilePath;
            const logFilePath = `${logDir}/${name ?? 'app'}.log`;
            return {
              pinoHttp: {
                // 始终由服务端生成请求 ID，并通过 X-Request-Id 响应头回显给客户端
                // 便于前后端联调和跨系统日志关联
                genReqId: (_req: Request, res: Response): string => {
                  const id = randomUUID();
                  res.setHeader('X-Request-Id', id);
                  return id;
                },
                autoLogging: {
                  // 跳过健康检查路由的自动请求/响应日志，避免日志噪音
                  ignore: (req: Request): boolean =>
                    req.url.startsWith('/health'),
                },
                // 按环境展开对应的配置片段（level、transport、redact 等）
                ...((isDev || isTest) &&
                  _buildDevConfig(logFileEnable, logFilePath)),
                ...(isProd && _buildProdConfig(logFileEnable, logFilePath)),
              },
            };
          },
        }),
      ],
    };
  }
}
