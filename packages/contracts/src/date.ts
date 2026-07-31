import { z } from "zod";

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealCalendarDate(value: string): boolean {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const localDateSchema = z
  .string()
  .regex(LOCAL_DATE_PATTERN, "日期格式必须为 YYYY-MM-DD")
  .refine(isRealCalendarDate, "日期不存在");

export type ExpiryStatus = "expired" | "expiringSoon" | "normal";

export function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalCalendarDays(localDate: string, days: number): string {
  const parsed = localDateSchema.parse(localDate);
  const [yearText, monthText, dayText] = parsed.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day + days, 12);
  return formatLocalDate(date);
}

export function classifyExpiry(
  expiryDate: string,
  today: string
): ExpiryStatus {
  const validExpiry = localDateSchema.parse(expiryDate);
  const validToday = localDateSchema.parse(today);

  if (validExpiry < validToday) {
    return "expired";
  }

  return validExpiry <= addLocalCalendarDays(validToday, 3)
    ? "expiringSoon"
    : "normal";
}

