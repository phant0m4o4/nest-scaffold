import { z } from 'zod';

const dateTimeSchema = z.iso.datetime({ precision: 0 });

/**
 * UTC 日期时间字符串 schema
 *
 * 严格接受 'YYYY-MM-DD HH:mm:ss' 形式的字符串，按 UTC 解析为 `Date`；
 * 不存在的日期或越界时间校验失败，不自动进位。用于查询参数 / 请求体中的时间字段。
 * 不指定自定义消息，错误文案交由请求语言对应的 zod locale 渲染。
 */
export const zUtcDateTime = z.string().transform((value, ctx) => {
  const isoDateTime = `${value.replace(' ', 'T')}Z`;
  if (value[10] !== ' ' || !dateTimeSchema.safeParse(isoDateTime).success) {
    ctx.addIssue({ code: 'custom' });
    return z.NEVER;
  }
  return new Date(isoDateTime);
});
