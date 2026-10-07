import { Dayjs } from 'dayjs';
import UTC from './utc';

/**
 * 格式化日期时间
 * @param utcDateTime 日期时间
 * @param timezone 时区
 * @returns 格式化后的日期时间
 */
export default function formatDateTime(
  utcDateTime: string | number | Date | Dayjs,
  template: string,
  timezone?: string,
): string {
  if (timezone) {
    return UTC(utcDateTime).tz(timezone).format(template);
  }
  return UTC(utcDateTime).format(template);
}
