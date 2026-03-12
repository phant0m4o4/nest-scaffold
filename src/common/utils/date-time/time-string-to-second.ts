/**
 * 将时间字符串转换为秒
 * @param timeString - 时间字符串 如：10s、10m、10h、10d、10w、10M、10y
 * @returns 秒
 */
export default function timeStringToSecond(timeString: string): number {
  // 截取字符串最后一位
  const lastChar = timeString.slice(-1);
  // 截取字符串除最后一位以外的部分
  const value = Number(timeString.slice(0, -1));
  // 如果 value 无法转换为数字，则抛出错误
  if (isNaN(value)) {
    throw new Error('无效的时间字符串');
  }
  // 根据最后一位字符，返回对应的时间戳
  switch (lastChar) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 24 * 60 * 60;
    case 'w':
      return value * 7 * 24 * 60 * 60;
    case 'M':
      return value * 30 * 24 * 60 * 60;
    case 'y':
      return value * 365 * 24 * 60 * 60;
    default:
      throw new Error('无效的时间字符串');
  }
}
