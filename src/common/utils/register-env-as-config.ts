import { ConfigObject, registerAs } from '@nestjs/config';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

/**
 * 环境变量验证选项接口
 */
interface EnvironmentValidationOptions {
  /** 是否启用隐式类型转换，默认为 true */
  enableImplicitConversion?: boolean;
  /** 是否排除多余的值，默认为 true */
  excludeExtraneousValues?: boolean;
  /** 是否跳过缺失的属性验证，默认为 false */
  skipMissingProperties?: boolean;
}

/**
 * 注册环境变量为 NestJS 配置
 *
 * 此函数结合了 class-transformer 和 class-validator 来：
 * 1. 过滤和转换环境变量
 * 2. 验证环境变量的有效性
 * 3. 生成类型安全的配置对象
 *
 * @param configToken 配置令牌，用于在应用中识别此配置
 * @param environmentClass 环境变量验证类
 * @param configFactory 配置工厂函数，接收验证后的环境变量，返回最终配置
 * @param validationOptions 验证选项
 * @returns 注册后的配置提供者
 * @throws {Error} 当环境变量验证失败时抛出详细错误信息
 *
 * @example
 * ```typescript
 * class DatabaseEnv {
 *   @IsString()
 *   DATABASE_HOST: string;
 *
 *   @IsInt()
 *   @Transform(({ value }) => parseInt(value, 10))
 *   DATABASE_PORT: number;
 * }
 *
 * const databaseConfig = registerEnvironmentAsConfig(
 *   'database',
 *   DatabaseEnv,
 *   (env) => ({
 *     host: env.DATABASE_HOST,
 *     port: env.DATABASE_PORT,
 *   })
 * );
 * ```
 */
export function registerEnvAsConfig<
  TEnvironment extends object,
  TConfig extends ConfigObject = ConfigObject,
>(
  configToken: string,
  environmentClass: ClassConstructor<TEnvironment>,
  configFactory: (validatedEnvironment: TEnvironment) => TConfig,
  validationOptions: EnvironmentValidationOptions = {},
) {
  if (!configToken) {
    throw new Error('configToken 不能为空');
  }
  if (!environmentClass) {
    throw new Error('environmentClass 不能为空');
  }
  if (!configFactory) {
    throw new Error('configFactory 不能为空');
  }

  const {
    enableImplicitConversion = true,
    excludeExtraneousValues = true,
    skipMissingProperties = false,
  } = validationOptions;

  return registerAs(configToken, (): TConfig => {
    try {
      // 转换环境变量为类实例
      const transformedEnvironment = plainToInstance(
        environmentClass,
        process.env,
        {
          enableImplicitConversion,
          excludeExtraneousValues,
        },
      );

      // 验证环境变量
      const validationErrors = validateSync(transformedEnvironment, {
        skipMissingProperties,
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (validationErrors.length > 0) {
        throw new Error(
          buildValidationErrorMessage(configToken, validationErrors),
        );
      }

      // 生成最终配置
      return configFactory(transformedEnvironment);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`配置 ${configToken} 初始化失败: ${String(error)}`);
    }
  });
}

/**
 * 构建详细的验证错误信息
 * @param configToken 配置令牌
 * @param validationErrors 验证错误数组
 * @returns 格式化的错误信息
 */
function buildValidationErrorMessage(
  configToken: string,
  validationErrors: ValidationError[],
): string {
  const errorMessages = validationErrors
    .map((error) => formatSingleValidationError(error))
    .filter((message) => message.length > 0);

  const errorHeader = `配置 ${configToken} 的环境变量验证失败:`;
  const errorBody = errorMessages.join('\n');

  return `${errorHeader}\n${errorBody}`;
}

/**
 * 格式化单个验证错误
 * @param error 单个验证错误
 * @returns 格式化的错误信息
 */
function formatSingleValidationError(error: ValidationError): string {
  const propertyPath = buildPropertyPath(error);
  const constraints = extractConstraintMessages(error);

  if (constraints.length === 0) {
    return `  • ${propertyPath}: 验证失败`;
  }

  return constraints
    .map((constraint) => `  • ${propertyPath}: ${constraint}`)
    .join('\n');
}

/**
 * 构建属性路径
 * @param error 验证错误
 * @returns 属性路径字符串
 */
function buildPropertyPath(error: ValidationError): string {
  const path: string[] = [];
  let currentError: ValidationError | undefined = error;

  while (currentError) {
    if (currentError.property) {
      path.unshift(currentError.property);
    }
    currentError = currentError.children?.find(() => true);
  }

  return path.join('.');
}

/**
 * 提取约束错误信息
 * @param error 验证错误
 * @returns 约束错误信息数组
 */
function extractConstraintMessages(error: ValidationError): string[] {
  const messages: string[] = [];

  if (error.constraints) {
    messages.push(...Object.values(error.constraints));
  }

  if (error.children && error.children.length > 0) {
    for (const childError of error.children) {
      messages.push(...extractConstraintMessages(childError));
    }
  }

  return messages;
}

// 保持向后兼容性的默认导出
export default registerEnvAsConfig;
