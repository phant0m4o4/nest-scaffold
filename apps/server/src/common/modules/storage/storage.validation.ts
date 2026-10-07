const CONTENT_TYPE_PATTERN =
  /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+(?: *; *[!#$%&'*+.^_`|~0-9A-Za-z-]+ *= *(?:[!#$%&'*+.^_`|~0-9A-Za-z-]+|"(?:[^"\\]|\\.)*"))*$/;

/** 签名和结果核验使用同一原始 MIME 值；这里只校验格式，不识别文件内容。 */
export function isStorageContentType(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 255 &&
    /^[\u0020-\u007e]+$/.test(value) &&
    CONTENT_TYPE_PATTERN.test(value)
  );
}
