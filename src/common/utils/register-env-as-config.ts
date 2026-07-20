import { ConfigObject, registerAs } from '@nestjs/config';
import { z } from 'zod';

/**
 * 注册环境变量为 NestJS 配置
 *
 * 此函数使用 zod 来：
 * 1. 过滤和转换环境变量（schema 之外的键自动剔除，`z.coerce.*` 完成字符串到目标类型的转换）
 * 2. 验证环境变量的有效性
 * 3. 生成类型安全的配置对象
 *
 * @param configToken 配置令牌，用于在应用中识别此配置
 * @param environmentSchema 环境变量 zod schema
 * @param configFactory 配置工厂函数，接收验证后的环境变量，返回最终配置
 * @returns 注册后的配置提供者
 * @throws {Error} 当环境变量验证失败时抛出详细错误信息
 *
 * @example
 * ```typescript
 * const databaseEnvSchema = z.object({
 *   DATABASE_HOST: z.string().min(1),
 *   DATABASE_PORT: z.coerce.number().int().optional(),
 * });
 *
 * const databaseConfig = registerEnvAsConfig(
 *   'database',
 *   databaseEnvSchema,
 *   (env) => ({
 *     host: env.DATABASE_HOST,
 *     port: env.DATABASE_PORT ?? 3306,
 *   }),
 * );
 * ```
 */
export function registerEnvAsConfig<
  TEnvironmentSchema extends z.ZodType,
  TConfig extends ConfigObject = ConfigObject,
>(
  configToken: string,
  environmentSchema: TEnvironmentSchema,
  configFactory: (
    validatedEnvironment: z.output<TEnvironmentSchema>,
  ) => TConfig,
) {
  if (!configToken) {
    throw new Error('configToken 不能为空');
  }
  if (!environmentSchema) {
    throw new Error('environmentSchema 不能为空');
  }
  if (!configFactory) {
    throw new Error('configFactory 不能为空');
  }

  return registerAs(configToken, (): TConfig => {
    const result = environmentSchema.safeParse(process.env);
    if (!result.success) {
      throw new Error(buildValidationErrorMessage(configToken, result.error));
    }
    return configFactory(result.data as z.output<TEnvironmentSchema>);
  });
}

/**
 * 构建详细的验证错误信息
 * @param configToken 配置令牌
 * @param error zod 验证错误
 * @returns 格式化的错误信息
 */
function buildValidationErrorMessage(
  configToken: string,
  error: z.ZodError,
): string {
  const errorMessages = error.issues.map((issue) => {
    const propertyPath = issue.path.join('.') || '(root)';
    return `  • ${propertyPath}: ${issue.message}`;
  });

  const errorHeader = `配置 ${configToken} 的环境变量验证失败:`;
  return `${errorHeader}\n${errorMessages.join('\n')}`;
}

// 保持向后兼容性的默认导出
export default registerEnvAsConfig;
