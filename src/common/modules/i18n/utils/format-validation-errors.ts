import { I18nValidationError } from 'nestjs-i18n';

export type FieldError = { rule: string; message: string };
export type FieldErrors = FieldError | FieldError[];
export type NestedErrorsObject = { [k: string]: NestedValidationErrors };
export type NestedValidationErrors =
  | FieldErrors
  | NestedErrorsObject
  | NestedValidationErrors[];

/**
 * 将 class-validator + nestjs-i18n 的校验错误树，格式化为嵌套结构：
 * - 叶子字段：返回单个错误对象或错误对象数组
 * - 对象字段：返回以子字段为键的对象
 * - 数组字段：返回以索引为位的数组，元素为对象或错误集合
 *
 * 示例（期望结构）：
 * {
 *   email: [
 *     { rule: 'isEmail', message: '请输入有效的邮箱地址' },
 *     { rule: 'isNotEmpty', message: '邮箱不能为空' },
 *   ],
 *   password: { rule: 'minLength', message: '密码至少 8 位' },
 *   friends: [ { name: { rule: 'isNotEmpty', message: '姓名不能为空' } } ],
 *   school: {
 *     class: [ { rule: 'isNotEmpty', message: '班级不能为空' } ],
 *     students: [ { name: { rule: 'isNotEmpty', message: '学生姓名不能为空' } } ]
 *   }
 * }
 */
export function formatValidationErrors(
  validationErrors: I18nValidationError[],
): NestedErrorsObject {
  const result: NestedErrorsObject = {};
  (validationErrors ?? []).forEach((rootError) => {
    const built = buildValidationNode(rootError);
    if (built !== undefined) {
      result[rootError.property] = built;
    }
  });
  return result;
}

/**
 * 构建单个校验节点的返回结构
 */
function buildValidationNode(
  err: I18nValidationError,
): NestedValidationErrors | undefined {
  const constraints = err.constraints as Record<string, unknown> | undefined;
  const children: I18nValidationError[] = err.children ?? [];
  const hasConstraints =
    constraints !== undefined && Object.keys(constraints).length > 0;
  const hasChildren = children.length > 0;
  if (!hasConstraints && !hasChildren) return undefined;
  if (!hasChildren && hasConstraints) {
    return buildFieldErrors(constraints);
  }
  // 如果有子节点，需判断是对象还是数组容器
  const isArrayContainer: boolean = children.every((c) =>
    isNumericString(c.property),
  );
  if (isArrayContainer) {
    const arr: NestedValidationErrors[] = [];
    children.forEach((child) => {
      const index: number = Number(child.property);
      const built = buildValidationNode(child);
      if (built !== undefined) {
        arr[index] = built;
      }
    });
    return arr;
  }
  const obj: NestedErrorsObject = {};
  children.forEach((child) => {
    const built = buildValidationNode(child);
    if (built !== undefined) {
      obj[child.property] = built;
    }
  });
  return obj;
}

/**
 * 将 constraints 转为错误对象或错误数组
 */
function buildFieldErrors(constraints: Record<string, unknown>): FieldErrors {
  const entries: [string, unknown][] = Object.entries(constraints);
  const errors: FieldError[] = entries.map(([rule, message]) => ({
    rule: String(rule),
    message: String(message),
  }));
  return errors.length === 1 ? errors[0] : errors;
}

function isNumericString(input: string): boolean {
  return /^\d+$/.test(input);
}
