import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { join } from 'path';
import { AppModule } from './app/app.module';
import { EnvironmentEnum } from './common/enums/environment.enum';
import { AppConfigType } from './configs/app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: true, // 允许所有来源（开发环境），生产环境应配置具体域名
      credentials: true, // 允许携带 Cookie（Cookie Session 认证必需）
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Type'],
    },
    rawBody: true, // 解析 body 为 rawBody 配合 Access Key 鉴权使用
    bufferLogs: true, // 缓存日志
  });
  // 启用进程信号优雅关闭：使 SIGTERM/SIGINT 触发 app.close()，
  // 进而执行各模块的 onModuleDestroy（如 RedisService 关闭连接）
  app.enableShutdownHooks();
  // 如果在代理服务器后面或者使用了负载均衡，需要设置这个保证获取到真实的客户端IP
  app.set('trust proxy', true);
  // 获取 pino 日志实例
  const logger: PinoLogger = app.get(PinoLogger);
  // 使用 pino 日志实例
  app.useLogger(logger);
  // 刷新日志 缓存
  app.flushLogs();
  // 获取配置服务
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfigType>('app');
  const { port, address, name } = appConfig;
  // 如果在代理服务器后面或者使用了负载均衡，需要设置这个保证获取到真实的客户端IP
  app.set('trust proxy', true);
  // 设置全局前缀 会触发warn 所以暂时注释
  // app.setGlobalPrefix('api');

  // 设置静态资源目录
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/public',
  });

  // 开发环境下启用 Swagger
  if (process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(`${name} API`)
      .setDescription(`${name} API文档`)
      .setVersion('1.0.0')
      .addBearerAuth()
      .addCookieAuth('sid')
      .build();
    const documentFactory = () =>
      SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, documentFactory);
  }

  await app.listen(port, address);
  logger.log({ context: 'Main', msg: `环境: ${process.env.NODE_ENV}` });
  logger.log({
    context: 'Main',
    msg: `应用 ${name} 运行在: ${await app.getUrl()}`,
  });
  // 开发环境下输出 Swagger 文档地址
  if (process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT) {
    logger.log({
      context: 'Main',
      msg: `Swagger 文档地址: ${await app.getUrl()}/api-docs`,
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
