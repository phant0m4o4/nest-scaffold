import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * 加密结果接口
 * @description AES-256-GCM 输出，包含初始化向量、密文与认证标签（均为 hex 编码）
 */
export interface EncryptedResultInterface {
  /** 初始化向量，用于加密算法 */
  iv: string;
  /** 加密后的数据 */
  encryptedData: string;
  /** GCM 认证标签 */
  authTag: string;
}

/**
 * 使用 AES-256-GCM 算法加密数据
 * @description scrypt(password, salt) → 32 字节密钥；IV 为 12 字节随机；返回 iv、密文与 authTag（hex）
 * @param data 要加密的原始数据（utf8）
 * @param password 加密口令
 * @param salt 加密盐值
 * @returns 包含 iv、encryptedData、authTag 的对象（均为 base64url 字符串）
 */
export function encrypt(
  data: string,
  password: string,
  salt: string,
): EncryptedResultInterface {
  // 使用 scrypt 从密码和盐值生成 32 字节密钥
  const key = scryptSync(password, salt, 32);
  // 使用 GCM 推荐的 12 字节随机 IV
  const iv = randomBytes(12);
  // 创建 AES-256-GCM 加密器（带认证）
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64url'),
    encryptedData: encrypted.toString('base64url'),
    authTag: authTag.toString('base64url'),
  };
}

/**
 * 解密 AES-256-GCM 加密的数据
 * @description 使用相同的密钥派生与 GCM 认证标签进行完整性验证，解密失败将抛错
 * @param encryptedData 密文（base64url）
 * @param iv 初始化向量（base64url，12 字节）
 * @param password 解密口令
 * @param salt 解密盐值
 * @param authTag 认证标签（base64url）
 * @returns 解密后的原始数据（utf8）
 */
export function Decrypt(
  encryptedData: string,
  iv: string,
  password: string,
  salt: string,
  authTag: string,
): string {
  // 使用 scrypt 从密码和盐值生成相同的 32 字节密钥
  const key = scryptSync(password, salt, 32);
  const encryptedDataBuffer = Buffer.from(encryptedData, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(encryptedDataBuffer),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
