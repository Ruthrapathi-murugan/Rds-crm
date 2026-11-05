/**
 * Human-readable identifiers.
 *
 * Invoice and quotation numbers follow GST rules: unique within a financial
 * year (April–March), at most 16 characters, using only letters, digits,
 * "/" and "-". Example: RDS/26-27/0001.
 */
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { APP_TIME_ZONE, type DateInput } from "@/lib/utils/date";

const inIST = tz(APP_TIME_ZONE);

export const SEQUENCE_PREFIXES = {
  lead: "LD",
  customer: "CU",
  project: "PRJ",
  payment: "PAY",
} as const;

export type SimpleSequence = keyof typeof SEQUENCE_PREFIXES;

export function formatSimpleNumber(kind: SimpleSequence, seq: number): string {
  return `${SEQUENCE_PREFIXES[kind]}-${String(seq).padStart(5, "0")}`;
}

/** Indian financial year of a date in IST, e.g. 15 Mar 2027 → "26-27". */
export function financialYear(value: DateInput): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = Number(format(date, "yyyy", { in: inIST }));
  const month = Number(format(date, "M", { in: inIST }));
  const start = month >= 4 ? year : year - 1;
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  return `${yy(start)}-${yy(start + 1)}`;
}

export const DOCUMENT_PREFIX_PATTERN = /^[A-Za-z0-9]{1,5}$/;

export function formatDocumentNumber(prefix: string, fy: string, seq: number): string {
  if (!DOCUMENT_PREFIX_PATTERN.test(prefix)) {
    throw new RangeError("Document prefix must be 1–5 letters or digits");
  }
  const number = `${prefix.toUpperCase()}/${fy}/${String(seq).padStart(4, "0")}`;
  if (number.length > 16) {
    throw new RangeError("Document number exceeds 16 characters");
  }
  return number;
}

/** Counter key per document type and financial year, so numbering restarts each April. */
export function documentCounterKey(kind: "invoice" | "quotation", prefix: string, fy: string) {
  return `${kind}:${prefix.toUpperCase()}:${fy}`;
}
