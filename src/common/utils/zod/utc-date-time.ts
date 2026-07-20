import { UTC } from '@/common/utils/date-time';
import { z } from 'zod';

/**
 * UTC 日期时间字符串 schema
 *
 * 接受 '2025-01-01 00:00:00' 形式的字符串，按 UTC 解析为 `Date`；
 * 解析失败时校验不通过。用于查询参数 / 请求体中的时间字段。
 * 不指定自定义消息，错误文案交由请求语言对应的 zod locale 渲染。
 */
export const zUtcDateTime = z.string().transform((value, ctx) => {
  const parsed = UTC(value);
  if (!parsed.isValid()) {
    ctx.addIssue({ code: 'custom' });
    return z.NEVER;
  }
  return parsed.toDate();
});
