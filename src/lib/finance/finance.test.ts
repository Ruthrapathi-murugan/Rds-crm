import { describe, expect, it } from "vitest";
import { parseDateInputIST } from "@/lib/utils/date";
import { computeDocument, computeLine, invoiceTitle, LineCalculationError, suggestTaxMode } from "./document-calc";
import { effectiveInvoiceStatus, statusForBalance } from "./invoice-status";
import { financialYear, formatDocumentNumber, formatSimpleNumber } from "./numbering";

describe("computeLine", () => {
  it("applies no tax when the document has no GST", () => {
    const line = computeLine({ quantity: 2, unitPricePaise: 50_000, discountPaise: 10_000, taxRateBps: 1800 }, "none");
    expect(line).toMatchObject({ amountPaise: 100_000, taxablePaise: 90_000, taxRateBps: 0, totalPaise: 90_000 });
  });

  it("splits intra-state GST equally into CGST and SGST", () => {
    const line = computeLine({ quantity: 1, unitPricePaise: 100_000, taxRateBps: 1800 }, "intra_state");
    expect(line).toMatchObject({ cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0, totalPaise: 118_000 });
  });

  it("keeps CGST and SGST equal when half the tax is a fraction of a paisa", () => {
    // 18% of ₹0.25 = 4.5p; each half 2.25p rounds to 2p.
    const line = computeLine({ quantity: 1, unitPricePaise: 25, taxRateBps: 1800 }, "intra_state");
    expect(line.cgstPaise).toBe(line.sgstPaise);
    expect(line.totalPaise).toBe(25 + line.cgstPaise * 2);
  });

  it("charges IGST for inter-state supply", () => {
    const line = computeLine({ quantity: 3, unitPricePaise: 33_333, taxRateBps: 1800 }, "inter_state");
    expect(line).toMatchObject({ amountPaise: 99_999, igstPaise: 18_000, cgstPaise: 0, totalPaise: 117_999 });
  });

  it("rejects discounts above the line amount and invalid quantities", () => {
    expect(() => computeLine({ quantity: 1, unitPricePaise: 100, discountPaise: 101 }, "none")).toThrow(
      LineCalculationError,
    );
    expect(() => computeLine({ quantity: 0, unitPricePaise: 100 }, "none")).toThrow(LineCalculationError);
    expect(() => computeLine({ quantity: 1.5, unitPricePaise: 100 }, "none")).toThrow(LineCalculationError);
    expect(() => computeLine({ quantity: 1, unitPricePaise: 10.5 }, "none")).toThrow(RangeError);
  });
});

describe("computeDocument", () => {
  it("totals are the exact sum of the lines", () => {
    const { items, totals } = computeDocument(
      [
        { quantity: 1, unitPricePaise: 2_500_000, discountPaise: 250_000, taxRateBps: 1800 },
        { quantity: 12, unitPricePaise: 799_900, taxRateBps: 1800 },
        { quantity: 1, unitPricePaise: 150_000, taxRateBps: 0 },
      ],
      "intra_state",
    );
    expect(totals.subtotalPaise).toBe(2_500_000 + 12 * 799_900 + 150_000);
    expect(totals.discountPaise).toBe(250_000);
    expect(totals.taxablePaise).toBe(totals.subtotalPaise - totals.discountPaise);
    expect(totals.cgstPaise).toBe(totals.sgstPaise);
    expect(totals.taxPaise).toBe(items.reduce((t, i) => t + i.cgstPaise + i.sgstPaise, 0));
    expect(totals.totalPaise).toBe(items.reduce((t, i) => t + i.totalPaise, 0));
  });

  it("preserves extra line fields such as descriptions", () => {
    const { items } = computeDocument([{ description: "Hotel website", quantity: 1, unitPricePaise: 100 }], "none");
    expect(items[0].description).toBe("Hotel website");
  });

  it("requires at least one line", () => {
    expect(() => computeDocument([], "none")).toThrow(LineCalculationError);
  });
});

describe("tax treatment", () => {
  it("suggests no GST for an unregistered business", () => {
    expect(suggestTaxMode({ sellerGstRegistered: false, sellerStateCode: "33", customerStateCode: "33" })).toBe("none");
  });

  it("suggests intra- or inter-state by customer state", () => {
    expect(suggestTaxMode({ sellerGstRegistered: true, sellerStateCode: "33", customerStateCode: "33" })).toBe(
      "intra_state",
    );
    expect(suggestTaxMode({ sellerGstRegistered: true, sellerStateCode: "33", customerStateCode: "32" })).toBe(
      "inter_state",
    );
  });

  it("titles a document Tax Invoice only when registered with a GSTIN and charging GST", () => {
    expect(invoiceTitle({ gstRegistered: true, gstin: "33ABCDE1234F1Z5", taxMode: "intra_state" })).toBe("Tax Invoice");
    expect(invoiceTitle({ gstRegistered: true, gstin: "", taxMode: "intra_state" })).toBe("Invoice");
    expect(invoiceTitle({ gstRegistered: false, gstin: "33ABCDE1234F1Z5", taxMode: "intra_state" })).toBe("Invoice");
    expect(invoiceTitle({ gstRegistered: true, gstin: "33ABCDE1234F1Z5", taxMode: "none" })).toBe("Invoice");
  });
});

describe("invoice status", () => {
  it("derives the status from payments", () => {
    expect(statusForBalance(10_000, 0)).toBe("sent");
    expect(statusForBalance(10_000, 4_000)).toBe("partially_paid");
    expect(statusForBalance(10_000, 10_000)).toBe("paid");
  });

  it("shows unpaid invoices as overdue after the IST due date", () => {
    const dueDate = parseDateInputIST("2026-10-20");
    const after = new Date("2026-10-20T18:30:00Z"); // 21 Oct 00:00 IST
    const before = new Date("2026-10-20T18:00:00Z"); // 20 Oct 23:30 IST
    expect(effectiveInvoiceStatus({ status: "sent", dueDate, balancePaise: 100 }, after)).toBe("overdue");
    expect(effectiveInvoiceStatus({ status: "partially_paid", dueDate, balancePaise: 100 }, after)).toBe("overdue");
    expect(effectiveInvoiceStatus({ status: "sent", dueDate, balancePaise: 100 }, before)).toBe("sent");
    expect(effectiveInvoiceStatus({ status: "paid", dueDate, balancePaise: 0 }, after)).toBe("paid");
    expect(effectiveInvoiceStatus({ status: "draft", dueDate, balancePaise: 100 }, after)).toBe("draft");
  });
});

describe("numbering", () => {
  it("uses the Indian financial year in IST", () => {
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("26-27"); // 31 Mar 23:30 IST
    expect(financialYear(new Date("2027-03-31T18:30:00Z"))).toBe("27-28"); // 1 Apr 00:00 IST
    expect(financialYear(new Date("2099-12-01T00:00:00Z"))).toBe("99-00");
  });

  it("formats GST-compliant document numbers", () => {
    const number = formatDocumentNumber("rds", "26-27", 7);
    expect(number).toBe("RDS/26-27/0007");
    expect(number.length).toBeLessThanOrEqual(16);
    expect(formatDocumentNumber("RDSQ", "26-27", 12345)).toBe("RDSQ/26-27/12345");
    expect(() => formatDocumentNumber("RDS-INV", "26-27", 1)).toThrow(RangeError);
  });

  it("formats simple sequences", () => {
    expect(formatSimpleNumber("lead", 42)).toBe("LD-00042");
    expect(formatSimpleNumber("payment", 123_456)).toBe("PAY-123456");
  });
});
