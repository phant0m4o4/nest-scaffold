/** 存储唯一值集合的映射，仅用于 seed 等一次性 CLI 命令，禁止在长期运行的服务中使用 */
const uniqueCollections = new Map<string, Set<string>>();

/**
 * 清除指定集合，或不传参时清除全部集合
 *
 * 建议在 seed 脚本结束后调用以释放内存
 */
export function clearUniqueCollections(collectionKey?: string): void {
  if (collectionKey) {
    uniqueCollections.delete(collectionKey);
  } else {
    uniqueCollections.clear();
  }
}

/**
 * 生成并确保唯一的字符串值（仅用于 seed 等一次性 CLI 命令，禁止在服务中使用）
 * @param generator 生成字符串的函数
 * @param collectionKey 唯一集合的标识
 * @param maxAttempts 最大尝试次数，默认为50次
 * @returns 保证在指定集合中唯一的字符串
 * @throws 如果达到最大尝试次数仍未生成唯一值，则抛出错误
 */
export async function unique(
  generator: () => string | Promise<string>,
  collectionKey: string,
  maxAttempts: number = 50,
): Promise<string> {
  const uniqueSet = uniqueCollections.get(collectionKey) || new Set<string>();
  let value: string;

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    value = await generator();
    if (!uniqueSet.has(value)) {
      uniqueSet.add(value);
      uniqueCollections.set(collectionKey, uniqueSet); // 保存集合回 Map
      return value;
    }
  }

  throw new Error(
    `无法在${maxAttempts}次尝试后生成唯一值，集合"${collectionKey}"可能已接近饱和`,
  );
}

/**
 * 生成并确保唯一的字符串数组
 * @param generator 生成字符串数组的函数
 * @param collectionKey 唯一集合的标识
 * @param maxAttempts 最大尝试次数，默认为50次
 * @returns 保证在指定集合中唯一的字符串数组
 * @throws 如果达到最大尝试次数仍未生成唯一值，则抛出错误
 */
export async function uniqueArray(
  generator: () => string[] | Promise<string[]>,
  collectionKey: string,
  maxAttempts: number = 50,
): Promise<string[]> {
  const uniqueSet = uniqueCollections.get(collectionKey) || new Set<string>();
  let values: string[];
  let valueKey: string;

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    values = await generator();
    // 使用 JSON 字符串化避免简单的连接可能导致的冲突
    valueKey = JSON.stringify(values);

    if (!uniqueSet.has(valueKey)) {
      uniqueSet.add(valueKey);
      uniqueCollections.set(collectionKey, uniqueSet); // 保存集合回 Map
      return values;
    }
  }

  throw new Error(
    `无法在${maxAttempts}次尝试后生成唯一数组，集合"${collectionKey}"可能已接近饱和`,
  );
}
