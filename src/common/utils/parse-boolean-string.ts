/**
 * 将字符串解析为布尔值
 * @param value 待解析字符串，支持 'true'/'false'、'1'/'0'（不区分大小写，会 trim）
 * @returns 解析后的布尔值
 * @throws 当 value 无法解析为布尔值时
 * @example
 * parseBooleanString('true') // true
 * parseBooleanString('  FALSE  ') // false
 * parseBooleanString('1') // true
 */
export function parseBooleanString(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new Error(
    `无法将字符串解析为布尔值: "${value}"，仅支持 'true'/'false'、'1'/'0'`,
  );
}
