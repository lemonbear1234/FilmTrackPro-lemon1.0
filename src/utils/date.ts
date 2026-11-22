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

/** 把任意日期字符串裁剪成 YYYY-MM-DD（保留已有日期部分，不做时区换算） */
export function toDateOnly(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const matched = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return matched ? matched[0] : null;
}
