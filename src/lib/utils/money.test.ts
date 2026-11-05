import { describe, expect, it } from "vitest";
import {
  applyBasisPoints,
  formatBasisPoints,
  formatINR,
  paiseToRupeeString,
  percentToBasisPoints,
  rupeesToPaise,
  sumPaise,
} from "./money";

describe("rupeesToPaise", () => {
  it.each([
    ["0", 0],
    ["1", 100],
    ["1.5", 150],
    ["1.05", 105],
    ["1,25,000.50", 12_500_050],
    ["₹ 999.99", 99_999],
    [12.5, 1250],
    [0.1, 10],
    ["-20.25", -2025],
  ])("parses %s", (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it("does not suffer from floating point drift", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in paise the sum is exact.
    expect(sumPaise([rupeesToPaise("0.1"), rupeesToPaise("0.2")])).toBe(rupeesToPaise("0.3"));
    expect(rupeesToPaise(1.15)).toBe(115); // 1.15 * 100 === 114.99999999999999
  });

  it.each(["", "abc", "1.005", "1.2.3", "1e5", NaN, Infinity])("rejects %s", (input) => {
    expect(() => rupeesToPaise(input as string | number)).toThrow(RangeError);
  });
});

describe("paiseToRupeeString", () => {
  it("formats plain decimals", () => {
    expect(paiseToRupeeString(0)).toBe("0.00");
    expect(paiseToRupeeString(5)).toBe("0.05");
    expect(paiseToRupeeString(125_050)).toBe("1250.50");
    expect(paiseToRupeeString(-2025)).toBe("-20.25");
  });

  it("rejects fractional paise", () => {
    expect(() => paiseToRupeeString(1.5)).toThrow(RangeError);
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(12_500_000_00)).toBe("₹1,25,00,000.00");
    expect(formatINR(99_999)).toBe("₹999.99");
  });
});

describe("applyBasisPoints", () => {
  it("calculates 18% exactly", () => {
    expect(applyBasisPoints(100_000, 1800)).toBe(18_000);
  });

  it("rounds half up to the nearest paisa", () => {
    expect(applyBasisPoints(25, 1800)).toBe(5); // 4.5 → 5
    expect(applyBasisPoints(1, 5000)).toBe(1); // 0.5 → 1
    expect(applyBasisPoints(1, 4999)).toBe(0); // 0.4999 → 0
  });

  it("is symmetric for negative amounts", () => {
    expect(applyBasisPoints(-25, 1800)).toBe(-5);
  });

  it("stays exact for large amounts", () => {
    // ₹10,000 crore at 18%
    expect(applyBasisPoints(10_000_000_000_00, 1800)).toBe(1_800_000_000_00);
  });

  it("rejects invalid rates", () => {
    expect(() => applyBasisPoints(100, -1)).toThrow(RangeError);
    expect(() => applyBasisPoints(100, 1.5)).toThrow(RangeError);
  });
});

describe("percent helpers", () => {
  it("converts percentages to basis points", () => {
    expect(percentToBasisPoints("18")).toBe(1800);
    expect(percentToBasisPoints("2.5")).toBe(250);
    expect(() => percentToBasisPoints("101")).toThrow(RangeError);
  });

  it("formats basis points", () => {
    expect(formatBasisPoints(1800)).toBe("18%");
    expect(formatBasisPoints(250)).toBe("2.5%");
    expect(formatBasisPoints(0)).toBe("0%");
  });
});
