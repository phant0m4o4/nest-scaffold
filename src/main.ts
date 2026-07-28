import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as PinoLogger } from 'nestjs-pino';
import { join } from 'path';
import { AppModule } from './app/app.module';
import { EnvironmentEnum } from './common/enums/environment.enum';
import { normalizeError } from './common/utils/normalize-error';
import {
  AppConfigType,
  getProductionCorsSecurityWarnings,
} from './configs/app.config';

/** 平滑停机最长等待时间（毫秒），超时后强制退出，防止 close 挂起阻塞部署滚动 */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // 解析 body 为 rawBody 配合 Access Key 鉴权使用
    bufferLogs: true, // 缓存日志
  });
  // 获取 pino 日志实例并接管 Nest 内置 logger
  const logger: PinoLogger = app.get(PinoLogger);
  app.useLogger(logger);
  app.flushLogs();
  // 获取配置服务
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfigType>('app');
  const { port, address, name, corsDomains, corsCredentials, trustProxy } =
    appConfig;

  // trust proxy：默认 false，即不信任 X-Forwarded-For，req.ip 取 TCP 对端地址、客户端伪造不了。
  // 仅当应用确实部署在 CDN / Nginx / 负载均衡之后，才通过 APP_TRUST_PROXY 开启，
  // 否则拿到的 req.ip 会是反代自己的 IP；而在没有反代的情况下误开，
  // 任何人都能伪造 X-Forwarded-For 绕过限流与 IP 黑白名单。
  // 反代场景推荐填代理层数（如 APP_TRUST_PROXY=1）而非 true，详见 configs/app.config.ts。
  app.set('trust proxy', trustProxy);

  // CORS：APP_CORS_DOMAINS 未配置或含 `*` 时反射任意来源，否则按白名单精确匹配。
  // 生产环境宽松配置只打 warning、不阻断启动——很多部署把 CORS 放在 CDN / 网关上管。
  const allowAllOrigins = corsDomains.length === 0 || corsDomains.includes('*');
  app.enableCors({
    origin: allowAllOrigins ? true : corsDomains,
    credentials: corsCredentials, // 是否允许携带 Cookie（Cookie Session 认证需要）
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type'],
  });
  for (const warning of getProductionCorsSecurityWarnings({
    isProduction: process.env.NODE_ENV === EnvironmentEnum.PRODUCTION,
    corsDomains,
    corsCredentials,
  })) {
    // 与业务模块 InjectPinoLogger 一致：第一个参数为绑定字段，第二个为消息正文
    logger.warn({ context: 'Main', event: 'cors_security_warn' }, warning);
  }

  // 设置全局前缀 会触发warn 所以暂时注释
  // app.setGlobalPrefix('api');

  // 设置静态资源目录
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/public',
  });

  // 平滑停机：显式监听 SIGTERM/SIGINT，触发 app.close() 以运行各模块的 onModuleDestroy
  // （释放分布式锁、关闭 Redis/DB 连接、drain BullMQ worker 等），
  // 相比 app.enableShutdownHooks() 增加了强制退出兜底，避免 close 卡住时进程无法退出。
  //
  // 注意：process.once 是「每个信号各自 once」，SIGTERM 与 SIGINT 几乎同时到达时
  // 仍可能各触发一次；用 shuttingDown 做互斥，第二次信号直接忽略。
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log({
      context: 'Main',
      msg: `收到信号 ${signal}，开始平滑停机...`,
    });
    const forceExitTimer = setTimeout(() => {
      logger.error({
        context: 'Main',
        msg: `平滑停机超过 ${SHUTDOWN_TIMEOUT_MS}ms，强制退出`,
      });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();
    try {
      await app.close();
      clearTimeout(forceExitTimer);
      logger.log({ context: 'Main', msg: '资源已释放，进程正常退出' });
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error({
        context: 'Main',
        err: normalizeError(error),
        msg: '平滑停机时发生错误',
      });
      process.exit(1);
    }
  };
  process.once('SIGTERM', (signal) => void shutdown(signal));
  process.once('SIGINT', (signal) => void shutdown(signal));

  await app.listen(port, address);
  logger.log({ context: 'Main', msg: `环境: ${process.env.NODE_ENV}` });
  logger.log({
    context: 'Main',
    msg: `应用 ${name} 运行在: ${await app.getUrl()}`,
  });
}
void bootstrap();
