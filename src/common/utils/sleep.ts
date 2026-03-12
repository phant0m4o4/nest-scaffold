/**
 * 睡眠函数
 * @param seconds 睡眠时间
 * @returns 睡眠结果
 */
export default async function Sleep(seconds: number) {
  return await new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, seconds * 1000);
  });
}
