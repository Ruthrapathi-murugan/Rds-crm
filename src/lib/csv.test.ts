import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Hotel "Sri", Palani')).toBe('"Hotel ""Sri"", Palani"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formulas in text but not numbers", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+91 98765 43210")).toBe("'+91 98765 43210");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-1250.5)).toBe("-1250.5");
  });

  it("starts with a BOM and uses CRLF", () => {
    const csv = toCsv(["Name", "Amount"], [["A", 1], [null, undefined]]);
    expect(csv.startsWith("﻿Name,Amount\r\n")).toBe(true);
    expect(csv).toContain("A,1\r\n,\r\n");
  });
});
