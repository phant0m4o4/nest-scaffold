import Dayjs from './dayjs';

/**
 * 使用 UTC Mode 的 Dayjs 实例
 * @see https://day.js.org/docs/en/timezone/utc
 * @example
 * ```ts
 * import Utc from '@/common/libs/date-time/utc';
 * const utc = Utc();
 * console.log(utc.format());
 * ```
 */
export default Dayjs.utc;
