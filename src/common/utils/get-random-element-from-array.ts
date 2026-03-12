/**
 * 从数组中随机获取一个元素
 * @param inputArray 输入的数组
 * @returns 随机获取的元素
 */
export default function getRandomElementFromArray<T>(inputArray: T[]): T {
  if (inputArray.length === 0) {
    throw new Error('输入数组为空');
  }
  const randomIndex = Math.floor(Math.random() * inputArray.length);
  return inputArray[randomIndex];
}
