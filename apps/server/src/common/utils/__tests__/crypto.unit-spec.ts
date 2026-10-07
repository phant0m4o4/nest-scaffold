import { describe, expect, it } from 'vitest';

import { decrypt, encrypt } from '../crypto';

const PASSWORD = 'unit-test-password';
const SALT = 'unit-test-salt';

describe('AES-256-GCM 加解密', () => {
  it('应使用 16 字节认证标签并保持往返兼容', () => {
    const encrypted = encrypt('测试正文', PASSWORD, SALT);
    expect(Buffer.from(encrypted.authTag, 'base64url')).toHaveLength(16);
    expect(
      decrypt(
        encrypted.encryptedData,
        encrypted.iv,
        PASSWORD,
        SALT,
        encrypted.authTag,
      ),
    ).toBe('测试正文');
  });

  it.each([4, 8, 12, 13, 14, 15])(
    '应拒绝截断为 %i 字节的真实认证标签',
    (length) => {
      const encrypted = encrypt('测试正文', PASSWORD, SALT);
      const tag = Buffer.from(encrypted.authTag, 'base64url')
        .subarray(0, length)
        .toString('base64url');
      expect(() =>
        decrypt(encrypted.encryptedData, encrypted.iv, PASSWORD, SALT, tag),
      ).toThrow();
    },
  );
});
