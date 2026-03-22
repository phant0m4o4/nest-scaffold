import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * ID 校验的额外可选规则
 *
 * 说明（所有文档使用中文）：
 * - id 必须是十进制数字字符串（默认不允许空白、符号、小数点）
 * - 支持设置范围：最小值与最大值，均使用 BigInt 语义进行比较
 * - 默认最小值为 1，最大值为无符号 BigInt 最大值（18446744073709551615）
 * - 可配置是否允许前导零、是否允许零值、是否自动 trim 两端空白
 * - 若需要可选（可为空）字段，请同时使用 class-validator 的 `@IsOptional()`
 */
type IdValidatorOptions = {
  readonly min?: string | number | bigint; // 默认 1
  readonly max?: string | number | bigint; // 默认 18446744073709551615
  readonly allowLeadingZeros?: boolean; // 默认 false，不允许前导零（如 "001"）
  readonly allowZero?: boolean; // 默认 false，若为 true 且未指定 min，则 min 自动视为 0
  readonly trim?: boolean; // 默认 true，校验前会 trim
};

/** 无符号 BigInt 最大值（2^64 - 1） */
const MAX_UNSIGNED_BIGINT = 18446744073709551615n;
/** 默认最小 ID 值 */
const DEFAULT_MIN_ID = 1n;

/**
 * 将 number/bigint/string 统一解析为 BigInt
 */
function toBigIntStrict(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  return BigInt(value);
}

/**
 * 判断是否为纯数字字符串
 */
function isNumericString(input: string): boolean {
  return /^\d+$/.test(input);
}

/**
 * 从 ValidationArguments 中安全取出 IsId 装饰器传入的 options。
 * class-validator 将 constraints 标为 any[]，需先收窄为 unknown 再校验，避免 no-unsafe-assignment。
 */
function getIdValidatorOptionsFromArgs(
  args?: ValidationArguments,
): IdValidatorOptions | undefined {
  const constraintsUnknown: unknown = args?.constraints;
  if (!Array.isArray(constraintsUnknown) || constraintsUnknown.length === 0) {
    return undefined;
  }
  const first: unknown = constraintsUnknown[0];
  if (first === undefined || first === null) return undefined;
  if (typeof first !== 'object') return undefined;
  return first as IdValidatorOptions;
}

/**
 * ID 校验器实现（内部使用，不导出）
 */
@ValidatorConstraint({ name: 'IsIdConstraint', async: false })
class IsIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args?: ValidationArguments): boolean {
    const options = getIdValidatorOptionsFromArgs(args);
    const allowLeadingZeros = options?.allowLeadingZeros ?? false;
    const trim = options?.trim ?? true;
    const allowZero = options?.allowZero ?? false;
    const minConfig = options?.min ?? (allowZero ? 0n : DEFAULT_MIN_ID);
    const maxConfig = options?.max ?? MAX_UNSIGNED_BIGINT;
    const min = toBigIntStrict(minConfig);
    const max = toBigIntStrict(maxConfig);
    if (typeof value !== 'string') return false;
    const raw = trim ? value.trim() : value;
    if (raw.length === 0) return false;
    if (!isNumericString(raw)) return false;
    if (!allowLeadingZeros && raw.length > 1 && raw.startsWith('0'))
      return false;
    if (raw.length > 20) return false; // 最大长度 20（18446744073709551615 的位数）
    let numeric: bigint;
    try {
      numeric = BigInt(raw);
    } catch {
      return false;
    }
    if (numeric < min) return false;
    if (numeric > max) return false;
    return true;
  }

  defaultMessage(args?: ValidationArguments): string {
    const options = getIdValidatorOptionsFromArgs(args);
    const allowLeadingZeros = options?.allowLeadingZeros ?? false;
    const allowZero = options?.allowZero ?? false;
    const minConfig = options?.min ?? (allowZero ? 0n : DEFAULT_MIN_ID);
    const maxConfig = options?.max ?? MAX_UNSIGNED_BIGINT;
    const min = toBigIntStrict(minConfig);
    const max = toBigIntStrict(maxConfig);
    const rules: string[] = [];
    rules.push('must be a decimal numeric string');
    rules.push(`range: ${min.toString()} ~ ${max.toString()}`);
    rules.push(
      allowLeadingZeros ? 'leading zeros allowed' : 'leading zeros not allowed',
    );
    return `ID validation failed (${rules.join(', ')})`;
  }
}

/**
 * 自定义装饰器：验证字段为有效 ID（数字字符串 + 范围约束）。
 *
 * 用法示例：
 * ```ts
 * class DemoDto {
 *   @IsId()
 *   id!: string;
 *
 *   @IsId({ min: 1, max: '9999999999999999999', allowLeadingZeros: false })
 *   userId!: string;
 * }
 * ```
 *
 * 建议与 `@IsOptional()` 配合使用处理可选字段。
 */
export function IsId(
  options?: IdValidatorOptions,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  // 仅导出装饰器，内部注册约束类，满足“每个文件只有一个导出”的项目规范
  return function (target: object, propertyKey: string | symbol): void {
    registerDecorator({
      name: 'IsId',
      target: target.constructor,
      propertyName: propertyKey as string,
      constraints: [options],
      options: validationOptions,
      validator: IsIdConstraint,
    });
  };
}
