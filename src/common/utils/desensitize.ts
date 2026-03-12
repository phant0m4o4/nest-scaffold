/**
 * 邮箱脱敏配置
 * @description 仅作用于邮箱本地部分（@ 前）。域名部分不做任何处理。
 * - keepStart: 本地部分保留前缀字符数（默认 1，最小 0，最大为本地部分长度）
 * - keepEnd: 本地部分保留后缀字符数（默认 0，最小 0，且 start+end 不超过本地部分长度）
 * - maskChar: 掩码字符（默认 '*'，可为任意字符串；建议使用单字符以保持长度直观）
 */
interface DesensitizeEmailOptions {
  keepStart?: number;
  keepEnd?: number;
  maskChar?: string;
}

/**
 * 脱敏邮箱（可配置）
 * @description 对邮箱地址的本地部分（@ 前）按配置进行掩码处理，域名原样保留。
 * - 不符合基本格式（不包含单个 @）的输入将原样返回。
 * - 会自动裁剪 keepStart/keepEnd，确保不越界且不为负数。
 * @param email 邮箱，如 `user@example.com`
 * @param options 配置项，详见 {@link DesensitizeEmailOptions}
 * @returns 脱敏后的邮箱，如 `u***@example.com`
 * @example
 * desensitizeEmail('alice@example.com') // 'a****@example.com'
 * @example
 * desensitizeEmail('ab@example.com', { keepStart: 1, keepEnd: 1 }) // 'a*@example.com'
 * @notes 复杂脚本与宽字符时 `length` 基于 JavaScript UTF-16 码元计数。
 */
export function desensitizeEmail(
  email: string,
  options: DesensitizeEmailOptions = {},
): string {
  const { keepStart = 1, keepEnd = 0, maskChar = '*' } = options;
  const parts = email.split('@');
  if (parts.length !== 2) {
    return email;
  }
  const [localPart, domain] = parts;
  // 归一化边界，防止越界或负数
  const startCount = Math.max(0, Math.min(keepStart, localPart.length));
  const endCount = Math.max(
    0,
    Math.min(keepEnd, Math.max(0, localPart.length - startCount)),
  );
  const maskCount = Math.max(0, localPart.length - startCount - endCount);
  const start = localPart.slice(0, startCount);
  const end = endCount > 0 ? localPart.slice(-endCount) : '';
  const masked = maskCount > 0 ? maskChar.repeat(maskCount) : '';
  return `${start}${masked}${end}@${domain}`;
}

/**
 * 手机号脱敏配置
 * @description 面向纯数字手机号（不含国家区号与分隔符）。
 * - keepStart: 前缀保留位数（默认 3，最小 0，最大为号码长度）
 * - keepEnd: 后缀保留位数（默认 3，最小 0，且 start+end 不超过号码长度）
 * - maskChar: 掩码字符（默认 '*'）
 */
interface DesensitizeMobileOptions {
  keepStart?: number;
  keepEnd?: number;
  maskChar?: string;
}

/**
 * 脱敏手机号（可配置，不包含国家区号）
 * @description 按配置对中间位进行掩码。
 * @param mobileNumber 手机号（不包含国家区号与分隔符）
 * @param options 配置项，详见 {@link DesensitizeMobileOptions}
 * @returns 脱敏后的手机号，如 `138****0021`
 * @example
 * desensitizeMobileNumber('13800000021') // '138****0021'
 * @example
 * desensitizeMobileNumber('123456', { keepStart: 1, keepEnd: 1, maskChar: '#' }) // '1####6'
 * @notes 不对输入做格式校验；如需校验请在外层完成。时间复杂度 O(n)。
 */
export function desensitizeMobileNumber(
  mobileNumber: string,
  options: DesensitizeMobileOptions = {},
): string {
  const { keepStart = 3, keepEnd = 3, maskChar = '*' } = options;
  const startCount = Math.max(0, Math.min(keepStart, mobileNumber.length));
  const endCount = Math.max(
    0,
    Math.min(keepEnd, Math.max(0, mobileNumber.length - startCount)),
  );
  const maskCount = Math.max(0, mobileNumber.length - startCount - endCount);
  const start = mobileNumber.slice(0, startCount);
  const end = endCount > 0 ? mobileNumber.slice(-endCount) : '';
  const masked = maskCount > 0 ? maskChar.repeat(maskCount) : '';
  return `${start}${masked}${end}`;
}
