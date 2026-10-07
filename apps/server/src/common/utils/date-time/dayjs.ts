import Dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

Dayjs.extend(utc); // 使用 UTC 时区插件
Dayjs.extend(timezone); // 使用时区插件
Dayjs.extend(isoWeek); // 使用 ISO 周插件
Dayjs.extend(duration); // 使用 duration 插件
export default Dayjs;
