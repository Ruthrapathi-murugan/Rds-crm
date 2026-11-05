/**
 * Amount in words using the Indian numbering system (thousand, lakh, crore),
 * as conventionally printed on Indian invoices and receipts.
 *   amountInWords(5_000_050) → "Rupees Fifty Thousand and Fifty Paise Only"
 */
import { assertPaise, type Paise } from "./money";

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

export function integerInIndianWords(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Expected a non-negative integer");
  if (value === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(value / 10_000_000);
  let rest = value % 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (crore) parts.push(`${integerInIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

export function amountInWords(paise: Paise): string {
  assertPaise(paise);
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const words = [`Rupees ${integerInIndianWords(rupees)}`];
  if (remainder) words.push(`and ${belowHundred(remainder)} Paise`);
  return `${negative ? "Minus " : ""}${words.join(" ")} Only`;
}
