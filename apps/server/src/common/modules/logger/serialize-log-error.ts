interface ILogError {
  name?: string;
  message?: string;
  stack?: string;
  code?: string | number;
  cause?: ILogError;
}

/** 只保留诊断字段，不序列化客户端、命令参数等附带对象。 */
export function serializeLogError(value: unknown): ILogError {
  try {
    return projectError(value, new Set(), 0);
  } catch {
    // 不可信对象的 getter 也可能抛错，不能让日志处理再次失败。
    return { message: '无法读取异常诊断信息' };
  }
}

function projectError(
  value: unknown,
  seen: Set<object>,
  depth: number,
): ILogError {
  if (depth >= 3) return { message: '[原因链已截断]' };
  if (typeof value === 'function') return { message: '非 Error 异常' };
  if (value === null || typeof value !== 'object') {
    return { message: String(value) };
  }
  if (seen.has(value)) return { message: '[循环原因]' };
  seen.add(value);
  const source = value as Record<string, unknown>;
  const result: ILogError = {};
  for (const key of ['name', 'message', 'stack'] as const) {
    const field = source[key];
    if (typeof field === 'string') result[key] = field;
  }
  const code = source.code;
  if (
    typeof code === 'string' ||
    (typeof code === 'number' && Number.isFinite(code))
  ) {
    result.code = code;
  }
  const cause = source.cause;
  if (cause !== undefined) {
    result.cause = projectError(cause, seen, depth + 1);
  }
  return result;
}
