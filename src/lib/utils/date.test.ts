import { describe, expect, it } from "vitest";
import {
  endOfMonthIST,
  formatDate,
  formatDateTime,
  isPastDueDate,
  monthKey,
  parseDateInputIST,
  startOfDayIST,
  startOfMonthIST,
  startOfMonthsAgoIST,
  toDateInputValue,
} from "./date";

// 2026-10-31T20:00:00Z is 1 Nov 2026, 01:30 IST — a UTC/IST month boundary.
const LATE_UTC = new Date("2026-10-31T20:00:00Z");

describe("IST formatting", () => {
  it("formats in Asia/Kolkata regardless of server timezone", () => {
    expect(process.env.TZ).toBe("UTC");
    expect(formatDate(LATE_UTC)).toBe("1 Nov 2026");
    expect(formatDateTime(LATE_UTC)).toBe("1 Nov 2026, 1:30 AM");
    expect(monthKey(LATE_UTC)).toBe("2026-11");
    expect(toDateInputValue(LATE_UTC)).toBe("2026-11-01");
  });

  it("rejects invalid dates", () => {
    expect(() => formatDate("not a date")).toThrow(RangeError);
  });
});

describe("IST boundaries", () => {
  it("computes the start of the IST day as a UTC instant", () => {
    expect(startOfDayIST(LATE_UTC).toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });

  it("computes IST month ranges", () => {
    expect(startOfMonthIST(LATE_UTC).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(endOfMonthIST(LATE_UTC).toISOString()).toBe("2026-11-30T18:29:59.999Z");
    expect(startOfMonthsAgoIST(LATE_UTC, 11).toISOString()).toBe("2025-11-30T18:30:00.000Z");
  });

  it("parses date inputs as IST calendar dates", () => {
    expect(parseDateInputIST("2026-11-01").toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(() => parseDateInputIST("01/11/2026")).toThrow(RangeError);
  });
});

describe("isPastDueDate", () => {
  const due = parseDateInputIST("2026-11-01");

  it("is not past due on the due date itself", () => {
    expect(isPastDueDate(due, new Date("2026-11-01T17:00:00Z"))).toBe(false); // 10:30 PM IST
  });

  it("is past due from the next IST day", () => {
    expect(isPastDueDate(due, new Date("2026-11-01T18:30:00Z"))).toBe(true); // 2 Nov 00:00 IST
  });
});
