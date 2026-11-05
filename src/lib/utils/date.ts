/**
 * Date helpers.
 *
 * Dates are stored in MongoDB as UTC instants. Every user-facing display and
 * every calendar boundary ("today", "this month") is computed in the
 * business timezone, Asia/Kolkata, regardless of where the server runs
 * (Vercel functions run in UTC).
 */
import { tz } from "@date-fns/tz";
import {
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";

export const APP_TIME_ZONE = "Asia/Kolkata";

const inIST = tz(APP_TIME_ZONE);

export type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${String(value)}`);
  }
  return date;
}

/** "22 Oct 2026" */
export function formatDate(value: DateInput): string {
  return format(toDate(value), "d MMM yyyy", { in: inIST });
}

/** "22 Oct 2026, 11:46 PM" */
export function formatDateTime(value: DateInput): string {
  return format(toDate(value), "d MMM yyyy, h:mm a", { in: inIST });
}

/** "11:46 PM" */
export function formatTime(value: DateInput): string {
  return format(toDate(value), "h:mm a", { in: inIST });
}

/** "Oct 2026" — used for monthly report buckets. */
export function formatMonth(value: DateInput): string {
  return format(toDate(value), "MMM yyyy", { in: inIST });
}

/** "2026-10" — stable key for grouping by IST calendar month. */
export function monthKey(value: DateInput): string {
  return format(toDate(value), "yyyy-MM", { in: inIST });
}

/** "2026-10-22" — value for <input type="date"> in IST. */
export function toDateInputValue(value: DateInput): string {
  return format(toDate(value), "yyyy-MM-dd", { in: inIST });
}

/** "2026-10-22T23:46" — value for <input type="datetime-local"> in IST. */
export function toDateTimeInputValue(value: DateInput): string {
  return format(toDate(value), "yyyy-MM-dd'T'HH:mm", { in: inIST });
}

/** Optional variants for form defaults: null/undefined → "". */
export function dateInputOrEmpty(value: DateInput | null | undefined): string {
  return value ? toDateInputValue(value) : "";
}
export function dateTimeInputOrEmpty(value: DateInput | null | undefined): string {
  return value ? toDateTimeInputValue(value) : "";
}

/** Relative day label in IST: "Today", "Tomorrow", "Yesterday" or the date. */
export function relativeDayLabel(value: DateInput, now: DateInput): string {
  const day = startOfDayIST(value).getTime();
  const today = startOfDayIST(now).getTime();
  const diff = Math.round((day - today) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(value);
}

/** Start of the IST calendar day containing `value`, as a UTC instant. */
export function startOfDayIST(value: DateInput): Date {
  return new Date(startOfDay(toDate(value), { in: inIST }).getTime());
}

/** End of the IST calendar day containing `value`, as a UTC instant. */
export function endOfDayIST(value: DateInput): Date {
  return new Date(endOfDay(toDate(value), { in: inIST }).getTime());
}

/** Start of the IST calendar month containing `value`, as a UTC instant. */
export function startOfMonthIST(value: DateInput): Date {
  return new Date(startOfMonth(toDate(value), { in: inIST }).getTime());
}

/** End of the IST calendar month containing `value`, as a UTC instant. */
export function endOfMonthIST(value: DateInput): Date {
  return new Date(endOfMonth(toDate(value), { in: inIST }).getTime());
}

/** Start of the IST month `count` months before the month containing `value`. */
export function startOfMonthsAgoIST(value: DateInput, count: number): Date {
  return startOfMonthIST(subMonths(toDate(value), count, { in: inIST }));
}

/**
 * Parses a "yyyy-MM-dd" string from a date input as an IST calendar date and
 * returns the start of that day as a UTC instant.
 */
export function parseDateInputIST(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`Expected yyyy-MM-dd, got "${value}"`);
  }
  // IST has no DST, so a fixed +05:30 offset is exact for every date.
  return toDate(`${value}T00:00:00+05:30`);
}

/** True when `due` is earlier than the start of today's IST day. */
export function isPastDueDate(due: DateInput, now: DateInput): boolean {
  return toDate(due).getTime() < startOfDayIST(now).getTime();
}
