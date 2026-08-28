import { createHash } from 'node:crypto';

/**
 * 将筛选对象规范化为稳定 JSON（键排序；Date → ISO）
 *
 * 忽略 undefined / null / 空串，与 Service 里「空筛选不进 WHERE」对齐，
 * 避免 `?name=` 与未传 name 算出不同 scope。
 */
export function canonicalizeFilterForScope(
  filter: Record<string, unknown>,
): string {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(filter).sort()) {
    const value = filter[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      continue;
    }
    normalized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return JSON.stringify(normalized);
}

/**
 * 构建游标 scope：`resourceKey` + 筛选 hash
 *
 * 筛选真相仍在 URL；scope 只用于防止改筛选后复用旧 cursor。
 */
export function buildCursorScope(
  resourceKey: string,
  filter: Record<string, unknown>,
): string {
  if (!resourceKey.trim()) {
    throw new Error('resourceKey 不能为空');
  }
  const hash = createHash('sha256')
    .update(canonicalizeFilterForScope(filter))
    .digest('hex');
  return `${resourceKey}:${hash}`;
}
