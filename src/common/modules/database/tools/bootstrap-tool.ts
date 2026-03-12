import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ToolsModule } from './tools.module';
import { ToolsService } from './tools.service';

/**
 * 数据库工具通用引导函数
 *
 * 创建 NestJS 应用上下文，执行指定操作，处理异常并优雅退出
 *
 * @param action 要执行的 ToolsService 方法名
 * @param labels 日志标签（成功/失败/事件名）
 */
export async function bootstrapTool(
  action: keyof Pick<ToolsService, 'init' | 'seed'>,
): Promise<void> {
  const applicationContext = await NestFactory.createApplicationContext(
    ToolsModule,
    { bufferLogs: true },
  );
  const logger = applicationContext.get(PinoLogger);
  applicationContext.useLogger(logger);
  applicationContext.flushLogs();
  const toolsService = applicationContext.get(ToolsService);
  await toolsService[action]();
  await applicationContext.close();
}
