/**
 * 将 bigint 转换为 number
 * @param bigIntValue bigint 值
 * @returns number 值
 * @throws 如果 bigint 值超出安全范围，则抛出错误
 */
export default function bigIntToNumber(bigIntValue: bigint): number {
  if (
    bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER) &&
    bigIntValue >= BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return Number(bigIntValue);
    // 安全使用 numberValue
  } else {
    throw new Error('BigInt 值超出了 Number 类型的安全范围');
    // 处理 bigIntValue 超出安全范围的情况
  }
}
