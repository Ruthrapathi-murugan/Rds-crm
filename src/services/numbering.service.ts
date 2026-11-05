import "server-only";
import type { ClientSession } from "mongoose";
import {
  documentCounterKey,
  financialYear,
  formatDocumentNumber,
  formatSimpleNumber,
  type SimpleSequence,
} from "@/lib/finance/numbering";
import { CounterModel } from "@/models/counter";

/**
 * Atomically increments and returns a named counter. When called inside a
 * transaction the increment rolls back with it, so aborted writes never
 * consume a number.
 */
export async function nextSequence(key: string, session?: ClientSession): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session },
  ).lean();
  if (!doc) throw new Error(`Counter ${key} could not be incremented`);
  return doc.seq;
}

export async function nextSimpleNumber(kind: SimpleSequence, session?: ClientSession) {
  return formatSimpleNumber(kind, await nextSequence(kind, session));
}

export async function nextDocumentNumber(
  kind: "invoice" | "quotation",
  prefix: string,
  date: Date,
  session?: ClientSession,
) {
  const fy = financialYear(date);
  const seq = await nextSequence(documentCounterKey(kind, prefix, fy), session);
  return formatDocumentNumber(prefix, fy, seq);
}
