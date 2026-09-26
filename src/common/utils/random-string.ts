/**
 * 从指定字符集中随机抽样，长度按 Unicode 码点计数。
 * @param length 非负安全整数；为零时返回空串
 * @param charPreset 可用字符集；允许重复模式保留重复字符的抽样权重
 * @param noneRepeat 是否禁止输出重复字符（按去重后的字符容量校验）
 * @throws 长度无效、字符集为空或唯一字符容量不足时抛出 RangeError
 * @remarks 使用 Math.random，不适合生成密码、令牌等安全凭据。
 */
export default function randomString(
  length: number,
  charPreset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  noneRepeat = false,
): string {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError('随机字符串长度必须为非负安全整数');
  }
  if (length === 0) return '';
  const availableChars = noneRepeat
    ? [...new Set(charPreset)]
    : [...charPreset];
  if (availableChars.length === 0) {
    throw new RangeError('随机字符串字符集不能为空');
  }
  if (noneRepeat && length > availableChars.length) {
    throw new RangeError('随机字符串长度不能超过唯一字符数量');
  }
  let result = '';
  for (let i = length; i > 0; --i) {
    const index = Math.floor(Math.random() * availableChars.length);
    result += availableChars[index];
    if (noneRepeat) {
      availableChars.splice(index, 1);
    }
  }
  return result;
}

/**
 * 不混淆字符集
 */
export const UN_CONFUSING_CHAR_PRESET =
  '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
