import { hash as argon2hash, verify as argon2verify } from 'argon2';

/**
 * 使用 Argon2 算法对数据进行哈希
 * @description Argon2 是一种内存硬化的哈希算法，适用于密码存储
 * @param data 要哈希的数据
 * @returns 哈希后的字符串
 */
export async function hash(data: string): Promise<string> {
  return await argon2hash(data);
}

/**
 * 比较原始数据与哈希值是否匹配
 * @description 使用 Argon2 验证原始数据是否与存储的哈希值匹配
 * @param hash 存储的哈希值
 * @param data 要验证的原始数据
 * @returns 如果匹配返回 true，否则返回 false
 */
export async function hashCompare(
  hash: string,
  data: string,
): Promise<boolean> {
  return await argon2verify(hash, data);
}
