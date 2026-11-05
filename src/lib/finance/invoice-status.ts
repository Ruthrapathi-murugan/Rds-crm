import type { InvoiceStatus, StoredInvoiceStatus } from "@/lib/constants";
import { isPastDueDate, type DateInput } from "@/lib/utils/date";
import type { Paise } from "@/lib/utils/money";

/**
 * Status after a payment change. Draft and cancelled invoices never accept
 * payments, so they are not handled here.
 */
export function statusForBalance(totalPaise: Paise, amountPaidPaise: Paise): StoredInvoiceStatus {
  if (amountPaidPaise <= 0) return "sent";
  if (amountPaidPaise >= totalPaise) return "paid";
  return "partially_paid";
}

/**
 * The status shown to users. "Overdue" is derived rather than stored, so an
 * invoice becomes overdue the moment its IST due date passes without needing
 * a background job.
 */
export function effectiveInvoiceStatus(
  invoice: { status: StoredInvoiceStatus; dueDate: DateInput; balancePaise: Paise },
  now: DateInput,
): InvoiceStatus {
  if (
    (invoice.status === "sent" || invoice.status === "partially_paid") &&
    invoice.balancePaise > 0 &&
    isPastDueDate(invoice.dueDate, now)
  ) {
    return "overdue";
  }
  return invoice.status;
}
