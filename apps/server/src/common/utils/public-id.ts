import { FF1 } from '@noble/ciphers/ff1.js';
import { nanoid } from 'nanoid';

/** 默认长度（与 nanoid 默认一致）；列宽见 createPublicIdColumn */
export const PUBLIC_ID_LENGTH = 21;

const DEFAULT_SEQUENCE_SIZE = 8;

type Ff1Options = {
  /** FF1 使用的 AES 密钥，须为 16、24 或 32 字节。 */
  secretKey: Uint8Array;
  /**
   * FF1 的可公开附加参数，用于在同一密钥下选择不同的排列。
   * 可传入固定的业务标识（如 `users/user_code`）或字节数组。字符串按 UTF-8 转换，省略时使用空字节串。
   * 解码须使用与编码完全相同的字节。同一发号范围内应固定 tweak，以保持无碰撞保证。
   */
  tweak?: string | Uint8Array;
};

type Ff1PublicIdOptions = Ff1Options & {
  /** 非负安全整数或 bigint，不能超出指定位数的范围。 */
  sequence: number | bigint;
};

type DecodePublicIdOptions = Ff1Options & {
  /** 编码位数，默认 8，最少 6。 */
  size?: number;
};

/**
 * 用 Nano ID 生成公开标识，字符集为 `A-Za-z0-9_-`。
 * 碰撞处理由业务逻辑和数据库唯一约束兜底。
 *
 * @param size 标识长度，默认 21。
 * @param algorithm 生成算法，默认 `nanoid`。
 * @returns 指定位数的随机字符串。
 * @example
 * ```ts
 * generatePublicId(); // 默认 21 位
 * generatePublicId(8); // 自定义长度
 * ```
 */
export function generatePublicId(size?: number, algorithm?: 'nanoid'): string;

/**
 * 用 FF1 将序号编码为定长纯数字公开标识。
 * 同一发号范围固定密钥、tweak 和位数，输入序号唯一时输出也唯一。
 *
 * @param size 标识位数，最少 6 位。
 * @param algorithm 生成算法 `ff1`。
 * @param options 序号、AES 密钥和可选的 tweak。
 * @returns 长度为 size 的数字字符串，保留前导零，不足时左补 0。
 * @throws {RangeError} 位数无效，或序号超出所选位数能表示的范围。
 * @example
 * ```ts
 * generatePublicId(8, 'ff1', { sequence: 42, secretKey, tweak: 'users/user_code' });
 * ```
 */
export function generatePublicId(
  size: number,
  algorithm: 'ff1',
  options: Ff1PublicIdOptions,
): string;

export function generatePublicId(
  size?: number,
  algorithm: 'nanoid' | 'ff1' = 'nanoid',
  options?: Ff1PublicIdOptions,
): string {
  if (algorithm === 'nanoid') {
    return nanoid(size ?? PUBLIC_ID_LENGTH);
  }
  if (algorithm !== 'ff1') {
    throw new TypeError('不支持的公开标识算法');
  }
  if (size === undefined || !options) {
    throw new TypeError('FF1 需要指定标识位数、序号和密钥');
  }

  assertSequenceSize(size);

  const { sequence, secretKey, tweak } = options;
  const isValidSequence =
    typeof sequence === 'bigint'
      ? sequence >= 0n
      : Number.isSafeInteger(sequence) && sequence >= 0;
  if (!isValidSequence) {
    throw new RangeError('序号必须是非负的安全整数或 bigint');
  }

  const decimal = sequence.toString();
  if (decimal.length > size) {
    throw new RangeError('序号超出所选位数的范围');
  }

  const digits = Array.from(decimal.padStart(size, '0'), Number);
  const encoded = FF1(10, secretKey, toTweakBytes(tweak))
    .encrypt(digits)
    .join('');
  return encoded.padStart(size, '0');
}

/**
 * 还原 {@link generatePublicId} 使用 FF1 编码的序号。
 *
 * @param encoded 完整的定长数字字符串，包含前导零。
 * @param options 与编码时相同的密钥、位数和 tweak。
 * @returns 原始序号，使用 bigint 保留大整数精度。
 * @throws {RangeError} 位数无效，或编码长度不符、包含非数字字符。
 *
 * @example
 * ```ts
 * // NIST 公开测试密钥，仅用于示例。
 * const secretKey = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex');
 * const options = { secretKey, tweak: 'users/user_code' };
 * const encoded = generatePublicId(8, 'ff1', { sequence: 42, ...options });
 * decodePublicId(encoded, { ...options, size: 8 }); // 42n
 * ```
 */
export function decodePublicId(
  encoded: string,
  { secretKey, size = DEFAULT_SEQUENCE_SIZE, tweak }: DecodePublicIdOptions,
): bigint {
  assertSequenceSize(size);

  if (
    typeof encoded !== 'string' ||
    encoded.length !== size ||
    /[^0-9]/.test(encoded)
  ) {
    throw new RangeError(`编码必须是 ${size} 位十进制数字字符串`);
  }

  const digits = Array.from(encoded, Number);
  const decodedDigits = FF1(10, secretKey, toTweakBytes(tweak)).decrypt(digits);
  return BigInt(decodedDigits.join(''));
}

function assertSequenceSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 6) {
    throw new RangeError('编码位数必须是至少 6 的安全整数');
  }
}

function toTweakBytes(tweak: Ff1Options['tweak']): Uint8Array | undefined {
  return typeof tweak === 'string' ? Buffer.from(tweak, 'utf8') : tweak;
}
