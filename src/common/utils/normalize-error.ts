/**
 * 将 unknown 转为 Error 实例
 *
 * 用于 catch / 事件回调等场景，便于日志与类型安全，避免项目中重复定义。
 * @param error 任意异常（unknown）
 * @returns 若已是 Error 则原样返回，否则用 String(error) 包装为 Error
 */
export function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
