import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '../encode-cursor';

const MASTER_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

describe('encodeCursor / decodeCursor', () => {
  it('应能往返加密解密', () => {
    const payload = {
      scope: 'demo.list:abc',
      order: [{ column: 'id', direction: 'desc' as const, value: 12 }],
    };

    const token = encodeCursor(payload, MASTER_KEY);
    expect(token.split('.')).toHaveLength(3);
    expect(decodeCursor(token, MASTER_KEY)).toEqual(payload);
  });

  it('篡改密文应抛出 BadRequestException', () => {
    const token = encodeCursor(
      {
        scope: 'demo.list:abc',
        order: [{ column: 'id', direction: 'desc', value: 1 }],
      },
      MASTER_KEY,
    );
    const tampered = `${token.slice(0, -2)}xx`;

    expect(() => decodeCursor(tampered, MASTER_KEY)).toThrow(
      BadRequestException,
    );
  });

  it('错误密钥应抛出 BadRequestException', () => {
    const token = encodeCursor(
      {
        scope: 'demo.list:abc',
        order: [{ column: 'id', direction: 'desc', value: 1 }],
      },
      MASTER_KEY,
    );
    const otherKey = Buffer.alloc(32, 7);

    expect(() => decodeCursor(token, otherKey)).toThrow(BadRequestException);
  });
});
