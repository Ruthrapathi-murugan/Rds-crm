import "server-only";
import { addDays } from "date-fns";
import { startOfDayIST, toDateInputValue } from "@/lib/utils/date";
import { paiseToInput } from "@/lib/utils/money";
import { isObjectIdString } from "@/services/scope";
import { buildBillTo, type DocumentLine } from "@/services/finance/documents";
import { getCompanySettings } from "@/services/settings.service";
import type { LineItemInput } from "@/lib/validations/finance";
import type { EditorSettings } from "./document-editor";

/** Settings the document editor needs; only active tax rates are offered. */
export async function loadEditorContext() {
  const settings = await getCompanySettings();
  const editor: EditorSettings = {
    gstRegistered: settings.gstRegistered && Boolean(settings.gstin),
    taxRates: settings.taxRates.filter((t) => t.isActive).map((t) => ({ label: t.label, rateBps: t.rateBps })),
    defaultTerms: "",
  };
  const today = startOfDayIST(new Date());
  return {
    editor,
    settings,
    today: toDateInputValue(today),
    plusDays: (days: number) => toDateInputValue(addDays(today, days)),
  };
}

/** Pre-selected customer for "New quotation/invoice" links from a customer page. */
export async function customerPrefill(customerId: string | undefined) {
  if (!isObjectIdString(customerId)) return null;
  try {
    const billTo = await buildBillTo(customerId);
    return { option: { value: customerId, label: billTo.businessName || billTo.name }, billTo };
  } catch {
    return null;
  }
}

/** Converts stored lines back into editable form values. */
export function linesToInput(items: DocumentLine[]): LineItemInput[] {
  return items.map((item) => ({
    service: item.serviceId ?? "",
    description: item.description,
    sacCode: item.sacCode,
    quantity: String(item.quantity),
    unitPrice: paiseToInput(item.unitPricePaise),
    discount: paiseToInput(item.discountPaise),
    taxRate: item.taxRateBps ? String(item.taxRateBps / 100) : "",
  }));
}
