import { endOfDayIST, parseDateInputIST, startOfMonthIST, startOfMonthsAgoIST, toDateInputValue } from "@/lib/utils/date";
import { financialYear } from "@/lib/finance/numbering";

export const RANGE_PRESETS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "this_fy", label: "This financial year" },
  { value: "last_fy", label: "Last financial year" },
  { value: "last_12_months", label: "Last 12 months" },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["value"];

/** Start of the Indian financial year (1 April, IST) containing `date`. */
function fyStart(date: Date): Date {
  const [startYY] = financialYear(date).split("-");
  return parseDateInputIST(`20${startYY}-04-01`);
}

export function presetRange(preset: RangePreset, now = new Date()): { from: Date; to: Date } {
  const today = endOfDayIST(now);
  switch (preset) {
    case "this_month":
      return { from: startOfMonthIST(now), to: today };
    case "last_month": {
      const start = startOfMonthsAgoIST(now, 1);
      return { from: start, to: new Date(startOfMonthIST(now).getTime() - 1) };
    }
    case "last_3_months":
      return { from: startOfMonthsAgoIST(now, 2), to: today };
    case "this_fy":
      return { from: fyStart(now), to: today };
    case "last_fy": {
      const start = fyStart(new Date(fyStart(now).getTime() - 1));
      return { from: start, to: new Date(fyStart(now).getTime() - 1) };
    }
    default:
      return { from: startOfMonthsAgoIST(now, 11), to: today };
  }
}

/**
 * Resolves ?from=yyyy-MM-dd&to=yyyy-MM-dd or ?range=<preset> into an IST range.
 * Defaults to the current financial year.
 */
export function resolveReportRange(sp: Record<string, string | string[] | undefined>, now = new Date()) {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const from = get("from");
  const to = get("to");
  const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (isDate(from) && isDate(to)) {
    const range = { from: parseDateInputIST(from!), to: endOfDayIST(parseDateInputIST(to!)) };
    if (range.from <= range.to && range.to.getTime() - range.from.getTime() <= 1000 * 86_400_000) {
      return { ...range, preset: null as RangePreset | null, fromInput: from!, toInput: to! };
    }
  }
  const presetParam = get("range");
  const preset = (RANGE_PRESETS.some((p) => p.value === presetParam) ? presetParam : "this_fy") as RangePreset;
  const range = presetRange(preset, now);
  return { ...range, preset, fromInput: toDateInputValue(range.from), toInput: toDateInputValue(range.to) };
}
