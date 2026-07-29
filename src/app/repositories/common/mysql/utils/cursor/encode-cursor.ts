import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { CursorPayload } from './cursor-payload';

const cursorPayloadSchema = z.object({
  scope: z.string().min(1),
  order: z
    .array(
      z.object({
        column: z.string().min(1),
        direction: z.enum(['asc', 'desc']),
        value: z.union([z.string(), z.number()]),
      }),
    )
    .min(1),
});

/**
 * 将游标载荷加密为不透明字符串（AES-256-GCM）
 *
 * 形态：`iv.authTag.ciphertext`（均为 base64url）
 */
export function encodeCursor(
  payload: CursorPayload,
  masterKey: Buffer,
): string {
  assertMasterKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

/**
 * 解密并校验游标载荷；失败抛出 400（不暴露细节）
 */
export function decodeCursor(token: string, masterKey: Buffer): CursorPayload {
  assertMasterKey(masterKey);
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('invalid token shape');
    }
    const [ivPart, authTagPart, ciphertextPart] = parts;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      masterKey,
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTagPart, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const parsed: unknown = JSON.parse(decrypted);
    const payload = cursorPayloadSchema.parse(parsed);
    if (payload.order[payload.order.length - 1]?.column !== 'id') {
      throw new Error('last order column must be id');
    }
    return payload;
  } catch {
    throw new BadRequestException('无效的分页游标');
  }
}

function assertMasterKey(masterKey: Buffer): void {
  if (masterKey.length !== 32) {
    throw new Error('APP_MASTER_KEY 必须为 32 字节');
  }
}
