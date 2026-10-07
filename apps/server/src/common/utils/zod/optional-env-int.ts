import { z } from 'zod';

/**
 * 环境变量整数 schema：空串/空白一律视为「未设置」
 *
 * `.env` 中引用缺失的锚点变量时（如 `CACHE_REDIS_PORT=${REDIS_PORT}` 而
 * `REDIS_PORT` 不存在），dotenv-expand 会把它展开成**空字符串**写入
 * `process.env`；`z.coerce.number()` 会把空串强转成 0，静默绕过必填校验、
 * 把错误拖到运行期。此处先把空白串归一为 undefined，让缺失走各模块的
 * 必填报错（启动即失败并指明变量名）。
 */
export function optionalEnvInt(minimum = 0) {
  return z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.coerce.number().int().min(minimum).optional(),
  );
}
