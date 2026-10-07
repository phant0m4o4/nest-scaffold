import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { NestFactory } from '@nestjs/core';
import { ToolsModule } from './tools.module';
import { ToolsService } from './tools.service';

/**
 * 数据库工具通用引导函数（PostgreSQL）
 *
 * 创建 NestJS 应用上下文，执行指定操作后关闭。
 * 使用 Nest 默认控制台日志，不做 Pino 与 bufferLogs 等额外编排。
 *
 * 错误处理约定：
 * - 业务执行（seed / reset）的异常会原样向上抛出。
 * - 关闭应用上下文本身失败时仅打印警告，**不覆盖**原始业务异常。
 *
 */
export async function bootstrapTool(
  action: keyof Pick<ToolsService, 'seed' | 'reset'>,
): Promise<void> {
  // seed 填充 faker 演示数据、reset 删表重放迁移，均仅限开发/测试环境
  if (process.env.NODE_ENV === EnvironmentEnum.PRODUCTION) {
    throw new Error(`${action} 仅用于开发/测试环境，生产环境禁止执行`);
  }
  const applicationContext =
    await NestFactory.createApplicationContext(ToolsModule);
  try {
    const toolsService = applicationContext.get(ToolsService);
    await toolsService[action]();
  } finally {
    try {
      await applicationContext.close();
    } catch (closeError) {
      console.warn('关闭应用上下文时发生错误，已忽略：', closeError);
    }
  }
}
