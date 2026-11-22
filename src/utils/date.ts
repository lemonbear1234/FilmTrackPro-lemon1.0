/**
 * 本地日期工具。
 *
 * 统一用本地时区生成 YYYY-MM-DD，替代 `new Date().toISOString().split('T')[0]`：
 * 后者取的是 UTC 日期，在东八区凌晨 0-8 点会算成「昨天」，
 * 导致默认观看日期错误、日期选择器的 max 也把今天禁掉。
 */

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 今天的本地日期，格式 YYYY-MM-DD */
export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

/**
 * 在 YYYY-MM-DD 上加减天数
 * 用 UTC 计时只是为了得到「日历日 + N」，不参与任何时区换算，跨月跨年都安全
 */
export function addDaysToDate(value: string, days: number): string {
  const matched = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) {
    return value;
  }

  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  date.setUTCDate(date.getUTCDate() + days);

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 目标日期距离今天还有几天：今天为 0，昨天为 -1，明天为 1 */
export function daysFromToday(value: string): number {
  const matched = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) {
    return Number.NaN;
  }

  const target = Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((target - today) / 86_400_000);
}

/** 把任意日期字符串裁剪成 YYYY-MM-DD（保留已有日期部分，不做时区换算） */
export function toDateOnly(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const matched = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return matched ? matched[0] : null;
}

/**
 * 星期几，1 = 周一 … 7 = 周日
 * 周更日（周一周二双更）靠它比对，不能直接用 Date.getDay()（周日是 0）
 */
export function weekdayOfDate(value: string): number {
  const matched = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) {
    return Number.NaN;
  }

  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** 所在周的周一（周一为一周起点，和 weekdayOfDate 对齐） */
export function startOfWeekDate(value: string): string {
  const weekday = weekdayOfDate(value);
  return Number.isNaN(weekday) ? value : addDaysToDate(value, 1 - weekday);
}
