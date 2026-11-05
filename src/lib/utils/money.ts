/**
 * Money helpers.
 *
 * All monetary amounts are stored and calculated as integer paise
 * (₹1 = 100 paise) to avoid floating-point errors. Percentages such as tax
 * and discount rates are stored as integer basis points (1% = 100 bps,
 * 18% = 1800 bps). Conversion to rupees happens only at the edges:
 * parsing user input and formatting for display.
 */

export type Paise = number;
export type BasisPoints = number;

const RUPEE_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

export function isPaise(value: unknown): value is Paise {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a whole number of paise, got ${value}`);
  }
  return value;
}

/**
 * Converts a rupee amount (e.g. "1,250.50", "99", 12.5) to integer paise.
 * Rejects values with more than two decimal places instead of silently
 * rounding them, so user input is never altered without notice.
 */
export function rupeesToPaise(input: string | number): Paise {
  const text =
    typeof input === "number"
      ? Number.isFinite(input)
        ? String(input)
        : ""
      : input.trim().replace(/[,₹\s]/g, "");

  const match = RUPEE_PATTERN.exec(text);
  if (!match) {
    throw new RangeError(`"${input}" is not a valid rupee amount (max 2 decimal places)`);
  }
  const [, sign, whole, fraction = ""] = match;
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  const result = sign ? -paise : paise;
  return assertPaise(result === 0 ? 0 : result);
}

/** Converts paise to a plain decimal rupee string, e.g. 125050 → "1250.50". */
export function paiseToRupeeString(paise: Paise): string {
  assertPaise(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const whole = Math.trunc(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompactFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Rupee string for form inputs: 125050 → "1250.50", 0 → "". */
export function paiseToInput(paise: Paise | null | undefined): string {
  if (!paise) return "";
  const text = paiseToRupeeString(paise);
  return text.endsWith(".00") ? text.slice(0, -3) : text;
}

/** Formats paise as Indian rupees with lakh/crore grouping, e.g. "₹1,25,000.00". */
export function formatINR(paise: Paise): string {
  assertPaise(paise);
  return inrFormatter.format(Number(paiseToRupeeString(paise)));
}

/** Short form for charts and stat cards, e.g. "₹1.2L", "₹3.4Cr". */
export function formatINRCompact(paise: Paise): string {
  assertPaise(paise);
  return inrCompactFormatter.format(paise / 100);
}

/**
 * Returns `rate` basis points of `paise`, rounded half away from zero to the
 * nearest paisa. Uses BigInt internally so large amounts stay exact.
 */
export function applyBasisPoints(paise: Paise, rate: BasisPoints): Paise {
  if (!Number.isSafeInteger(rate) || rate < 0) {
    throw new RangeError(`rate must be a non-negative whole number of basis points, got ${rate}`);
  }
  return mulDivRound(paise, rate, 10_000);
}

/**
 * Returns paise × numerator ÷ denominator, rounded half away from zero, with
 * exact BigInt arithmetic. Used for tax splits such as CGST = taxable × rate ÷ 2.
 */
export function mulDivRound(paise: Paise, numerator: number, denominator: number): Paise {
  assertPaise(paise);
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError("numerator must be a non-negative integer and denominator a positive integer");
  }
  const negative = paise < 0;
  const product = BigInt(Math.abs(paise)) * BigInt(numerator);
  const den = BigInt(denominator);
  const rounded = (product * 2n + den) / (den * 2n); // half-up on the absolute value
  const result = Number(negative ? -rounded : rounded);
  return assertPaise(result === 0 ? 0 : result);
}

export function sumPaise(values: readonly Paise[]): Paise {
  let total = 0;
  for (const value of values) total += assertPaise(value);
  return assertPaise(total, "total");
}

/** Converts a percentage string such as "18" or "2.5" to basis points. */
export function percentToBasisPoints(input: string | number): BasisPoints {
  // Same shape as a rupee amount: up to two decimals, scaled by 100.
  const bps = rupeesToPaise(input);
  if (bps < 0 || bps > 10_000) {
    throw new RangeError(`percentage must be between 0 and 100, got ${input}`);
  }
  return bps;
}

/** Formats basis points as a percentage label, e.g. 1800 → "18%", 250 → "2.5%". */
export function formatBasisPoints(rate: BasisPoints): string {
  return `${Number((rate / 100).toFixed(2))}%`;
}
