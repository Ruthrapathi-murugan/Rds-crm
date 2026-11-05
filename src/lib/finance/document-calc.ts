/**
 * Quotation and invoice arithmetic. Pure functions over integer paise so the
 * exact same numbers are produced in the browser preview and on the server,
 * where they are always recomputed — totals sent by the client are ignored.
 *
 * Per line:
 *   amount   = quantity × unit price
 *   taxable  = amount − line discount
 *   intra-state GST: CGST = SGST = taxable × rate ÷ 2 (each rounded to the paisa)
 *   inter-state GST: IGST = taxable × rate
 *   total    = taxable + tax
 * Document totals are the sums of the line values, so the printed lines
 * always add up to the printed totals.
 */
import type { TaxMode } from "@/lib/constants";
import { assertPaise, mulDivRound, type BasisPoints, type Paise } from "@/lib/utils/money";

export type LineInput = {
  quantity: number;
  unitPricePaise: Paise;
  discountPaise?: Paise;
  taxRateBps?: BasisPoints;
};

export type ComputedLine = {
  quantity: number;
  unitPricePaise: Paise;
  discountPaise: Paise;
  taxRateBps: BasisPoints;
  amountPaise: Paise;
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  totalPaise: Paise;
};

export type DocumentTotals = {
  subtotalPaise: Paise;
  discountPaise: Paise;
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
};

export class LineCalculationError extends RangeError {
  constructor(
    readonly lineIndex: number,
    message: string,
  ) {
    super(message);
    this.name = "LineCalculationError";
  }
}

export function computeLine(line: LineInput, taxMode: TaxMode, index = 0): ComputedLine {
  const { quantity, unitPricePaise } = line;
  const discountPaise = line.discountPaise ?? 0;
  const taxRateBps = taxMode === "none" ? 0 : (line.taxRateBps ?? 0);

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new LineCalculationError(index, "Quantity must be a whole number of at least 1");
  }
  assertPaise(unitPricePaise, "unit price");
  assertPaise(discountPaise, "discount");
  if (unitPricePaise < 0 || discountPaise < 0) {
    throw new LineCalculationError(index, "Prices and discounts cannot be negative");
  }
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
    throw new LineCalculationError(index, "Tax rate must be between 0% and 100%");
  }

  const amountPaise = assertPaise(quantity * unitPricePaise, "line amount");
  if (discountPaise > amountPaise) {
    throw new LineCalculationError(index, "Discount cannot be more than the line amount");
  }
  const taxablePaise = amountPaise - discountPaise;

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (taxMode === "intra_state") {
    cgstPaise = mulDivRound(taxablePaise, taxRateBps, 20_000);
    sgstPaise = cgstPaise;
  } else if (taxMode === "inter_state") {
    igstPaise = mulDivRound(taxablePaise, taxRateBps, 10_000);
  }

  return {
    quantity,
    unitPricePaise,
    discountPaise,
    taxRateBps,
    amountPaise,
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalPaise: taxablePaise + cgstPaise + sgstPaise + igstPaise,
  };
}

export function computeDocument<T extends LineInput>(
  lines: readonly T[],
  taxMode: TaxMode,
): { items: (Omit<T, keyof ComputedLine> & ComputedLine)[]; totals: DocumentTotals } {
  if (lines.length === 0) {
    throw new LineCalculationError(0, "Add at least one line item");
  }
  const items = lines.map((line, index) => ({ ...line, ...computeLine(line, taxMode, index) }));

  const sum = (key: keyof ComputedLine) =>
    assertPaise(items.reduce((total, item) => total + item[key], 0), key);

  const cgstPaise = sum("cgstPaise");
  const sgstPaise = sum("sgstPaise");
  const igstPaise = sum("igstPaise");
  const taxablePaise = sum("taxablePaise");
  const taxPaise = cgstPaise + sgstPaise + igstPaise;

  return {
    items,
    totals: {
      subtotalPaise: sum("amountPaise"),
      discountPaise: sum("discountPaise"),
      taxablePaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      taxPaise,
      totalPaise: taxablePaise + taxPaise,
    },
  };
}

/**
 * Suggests the GST treatment: none unless the business is GST-registered;
 * otherwise intra-state when the customer is in the seller's state.
 * Users can always override the suggestion on the document.
 */
export function suggestTaxMode(input: {
  sellerGstRegistered: boolean;
  sellerStateCode?: string | null;
  customerStateCode?: string | null;
}): TaxMode {
  if (!input.sellerGstRegistered) return "none";
  if (!input.customerStateCode || !input.sellerStateCode) return "intra_state";
  return input.customerStateCode === input.sellerStateCode ? "intra_state" : "inter_state";
}

/** Document title. "Tax Invoice" only for a GST-registered seller charging GST. */
export function invoiceTitle(input: { gstRegistered: boolean; gstin?: string | null; taxMode: TaxMode }) {
  return input.gstRegistered && input.gstin && input.taxMode !== "none" ? "Tax Invoice" : "Invoice";
}
