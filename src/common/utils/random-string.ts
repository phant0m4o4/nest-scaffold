export default function randomString(
  length: number,
  charPreset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  noneRepeat = false,
): string {
  let result = '';
  let availableChars = charPreset;
  for (let i = length; i > 0; --i) {
    const index = Math.floor(Math.random() * availableChars.length);
    result += availableChars[index];
    if (noneRepeat) {
      availableChars =
        availableChars.slice(0, index) + availableChars.slice(index + 1);
    }
  }
  return result;
}

/**
 * 不混淆字符集
 */
export const UN_CONFUSING_CHAR_PRESET =
  '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
