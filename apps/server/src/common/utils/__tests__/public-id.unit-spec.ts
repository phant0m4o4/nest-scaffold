import { describe, expect, it } from 'vitest';

import {
  decodePublicId,
  generatePublicId,
  PUBLIC_ID_LENGTH,
} from '../public-id';

// NIST FF1-AES128 样例 #1 和 #2 的公开测试密钥。
const secretKey = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex');

describe('generatePublicId', () => {
  it('默认长度应为 PUBLIC_ID_LENGTH', () => {
    expect(generatePublicId()).toHaveLength(PUBLIC_ID_LENGTH);
  });

  it('自定义长度应生效', () => {
    expect(generatePublicId(8)).toHaveLength(8);
  });

  it('应只包含 URL-safe 字符', () => {
    expect(generatePublicId()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('应支持显式选择 Nano ID', () => {
    expect(generatePublicId(8, 'nanoid')).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });
});

describe('generatePublicId 使用 FF1', () => {
  it('应按 NIST 测试向量编码为十进制数字串', () => {
    expect(
      generatePublicId(10, 'ff1', { sequence: 123456789, secretKey }),
    ).toBe('2433477484');
    expect(
      generatePublicId(10, 'ff1', {
        sequence: 123456789n,
        secretKey,
        tweak: '9876543210',
      }),
    ).toBe('6124200773');
  });

  it('应生成指定位数并保留前导零', () => {
    expect(generatePublicId(8, 'ff1', { sequence: 9, secretKey })).toBe(
      '06153291',
    );
    expect(generatePublicId(8, 'ff1', { sequence: 9n, secretKey })).toBe(
      '06153291',
    );
  });

  it('固定参数下不同序号应得到不同编码', () => {
    const firstCode = generatePublicId(6, 'ff1', { sequence: 0, secretKey });
    const lastCode = generatePublicId(6, 'ff1', {
      sequence: 999999n,
      secretKey,
    });

    expect(firstCode).toMatch(/^\d{6}$/);
    expect(lastCode).toMatch(/^\d{6}$/);
    expect(firstCode).not.toBe(lastCode);
  });

  it('应保留超出安全整数范围的 bigint 序号精度', () => {
    expect(
      generatePublicId(16, 'ff1', { sequence: 9007199254740993n, secretKey }),
    ).toBe('4660641086130624');
  });

  it.each([5, 6.5, Number.MAX_SAFE_INTEGER + 1])(
    '应拒绝无效位数 %s',
    (size) => {
      expect(() =>
        generatePublicId(size, 'ff1', { sequence: 0, secretKey }),
      ).toThrow(RangeError);
    },
  );

  it.each([-1, -1n, 0.5, Number.MAX_SAFE_INTEGER + 1, 100_000_000n])(
    '应拒绝无效序号 %s',
    (sequence) => {
      expect(() => generatePublicId(8, 'ff1', { sequence, secretKey })).toThrow(
        RangeError,
      );
    },
  );

  it('应拒绝无效的 AES 密钥长度', () => {
    expect(() =>
      generatePublicId(8, 'ff1', {
        sequence: 0,
        secretKey: new Uint8Array(15),
      }),
    ).toThrow();
  });
});

describe('decodePublicId', () => {
  it('应按 NIST 测试向量解码为原序号', () => {
    expect(decodePublicId('2433477484', { secretKey, size: 10 })).toBe(
      123456789n,
    );
    expect(
      decodePublicId('6124200773', {
        secretKey,
        size: 10,
        tweak: Buffer.from('9876543210'),
      }),
    ).toBe(123456789n);
  });

  it('默认应解码含前导零的 8 位数字串', () => {
    expect(decodePublicId('06153291', { secretKey })).toBe(9n);
  });

  it('应无损还原超出安全整数范围的 bigint 序号', () => {
    const sequence = 9007199254740993n;
    const encoded = generatePublicId(16, 'ff1', { sequence, secretKey });

    expect(decodePublicId(encoded, { secretKey, size: 16 })).toBe(sequence);
  });

  it.each(['6153291', '006153291', '0615329a', '1234567\n'])(
    '应拒绝不符合格式的数字串 %j',
    (encoded) => {
      expect(() => decodePublicId(encoded, { secretKey })).toThrow(RangeError);
    },
  );

  it('应拒绝少于 6 位的解码设置', () => {
    expect(() => decodePublicId('12345', { secretKey, size: 5 })).toThrow(
      RangeError,
    );
  });
});

describe('FF1 tweak', () => {
  it.each(['users/user_code', '用户编号'])(
    '应支持 %s 与 UTF-8 字节互通',
    (tweak) => {
      const sequence = 42n;
      const textOptions = { secretKey, tweak };
      const byteOptions = { secretKey, tweak: Buffer.from(tweak, 'utf8') };

      const textEncoded = generatePublicId(8, 'ff1', {
        sequence,
        ...textOptions,
      });
      const byteEncoded = generatePublicId(8, 'ff1', {
        sequence,
        ...byteOptions,
      });

      expect(textEncoded).toBe(byteEncoded);
      expect(decodePublicId(textEncoded, byteOptions)).toBe(sequence);
      expect(decodePublicId(byteEncoded, textOptions)).toBe(sequence);
    },
  );
});
