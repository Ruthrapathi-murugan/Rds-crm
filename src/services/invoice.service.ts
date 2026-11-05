import "server-only";
import { Types, type ClientSession } from "mongoose";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type InvoiceStatus,
  type PaymentMethod,
  type PaymentStatus,
  type StoredInvoiceStatus,
  type TaxMode,
} from "@/lib/constants";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { effectiveInvoiceStatus, statusForBalance } from "@/lib/finance/invoice-status";
import { escapeRegex, paginated, skipFor } from "@/lib/list-params";
import { connectToDatabase, withTransaction } from "@/lib/mongodb";
import { endOfDayIST, startOfDayIST } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import type { InvoiceFormData } from "@/lib/validations/finance";
import { InvoiceModel, type InvoiceDoc } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { ProjectModel } from "@/models/project";
import type { ListParams, Paginated, SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import {
  assertTaxTreatment,
  buildBillTo,
  invoiceTitle,
  prepareLines,
  sellerSnapshot,
  toBillTo,
  toDocumentLine,
  toTotals,
  type BillTo,
  type DocumentLine,
  type DocumentTotals,
} from "./finance/documents";
import { idOrNull, isoOrNull, userNames } from "./lookup.service";
import { nextDocumentNumber } from "./numbering.service";
import { andFilters, toObjectId } from "./scope";
import { getCompanySettings } from "./settings.service";

export const INVOICE_SORTS = ["issueDate", "dueDate", "invoiceNumber", "totals.totalPaise", "balancePaise"] as const;
export type InvoiceSort = (typeof INVOICE_SORTS)[number];

export type InvoiceFilters = {
  status?: InvoiceStatus;
  customer?: string;
  project?: string;
  from?: Date;
  to?: Date;
};

export type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  totalPaise: number;
  amountPaidPaise: number;
  balancePaise: number;
  status: InvoiceStatus;
  storedStatus: StoredInvoiceStatus;
};

export type InvoicePayment = {
  id: string;
  paymentNumber: string;
  paidAt: string;
  amountPaise: number;
  method: PaymentMethod;
  methodLabel: string;
  transactionReference: string;
  status: PaymentStatus;
};

export type Seller = {
  name: string;
  address: string;
  stateName: string;
  stateCode: string;
  gstin: string;
  gstRegistered: boolean;
  email: string;
  phone: string;
};

export type InvoiceDetail = InvoiceRow & {
  title: string;
  billTo: BillTo;
  seller: Seller | null;
  taxMode: TaxMode;
  placeOfSupply: string;
  items: DocumentLine[];
  totals: DocumentTotals;
  terms: string;
  notes: string;
  projectId: string | null;
  projectName: string | null;
  quotationId: string | null;
  issuedAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  createdByName: string | null;
  payments: InvoicePayment[];
};

function toRow(doc: InvoiceDoc, now: Date): InvoiceRow {
  const stored = doc.status as StoredInvoiceStatus;
  return {
    id: doc._id.toString(),
    invoiceNumber: doc.invoiceNumber ?? null,
    customerId: doc.customer.toString(),
    customerName: doc.billTo?.businessName || doc.billTo?.name || "",
    issueDate: doc.issueDate.toISOString(),
    dueDate: doc.dueDate.toISOString(),
    totalPaise: doc.totals?.totalPaise ?? 0,
    amountPaidPaise: doc.amountPaidPaise ?? 0,
    balancePaise: doc.balancePaise ?? 0,
    status: effectiveInvoiceStatus({ status: stored, dueDate: doc.dueDate, balancePaise: doc.balancePaise ?? 0 }, now),
    storedStatus: stored,
  };
}

/** Mongo filter for an effective status (overdue is derived from the IST due date). */
export function invoiceStatusFilter(status: InvoiceStatus | undefined, now: Date): Record<string, unknown> {
  if (!status) return {};
  const today = startOfDayIST(now);
  switch (status) {
    case "overdue":
      return { status: { $in: ["sent", "partially_paid"] }, balancePaise: { $gt: 0 }, dueDate: { $lt: today } };
    case "sent":
    case "partially_paid":
      return { status, $or: [{ dueDate: { $gte: today } }, { balancePaise: 0 }] };
    default:
      return { status };
  }
}

export async function listInvoices(
  _user: SessionUser,
  params: ListParams<InvoiceSort>,
  filters: InvoiceFilters = {},
): Promise<Paginated<InvoiceRow>> {
  await connectToDatabase();
  const now = new Date();
  const base: Record<string, unknown> = {};
  if (filters.customer && Types.ObjectId.isValid(filters.customer)) base.customer = new Types.ObjectId(filters.customer);
  if (filters.project && Types.ObjectId.isValid(filters.project)) base.project = new Types.ObjectId(filters.project);
  if (filters.from || filters.to) {
    base.issueDate = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) };
  }
  const q = params.q ? new RegExp(escapeRegex(params.q), "i") : null;
  const query = andFilters(
    base,
    invoiceStatusFilter(filters.status, now),
    q ? { $or: [{ invoiceNumber: q }, { "billTo.name": q }, { "billTo.businessName": q }, { "billTo.gstin": q }] } : {},
  );
  const sort: Record<string, 1 | -1> = { [params.sort]: params.dir === "asc" ? 1 : -1, _id: -1 };
  const [docs, total] = await Promise.all([
    InvoiceModel.find(query).sort(sort).skip(skipFor(params)).limit(params.pageSize).lean(),
    InvoiceModel.countDocuments(query),
  ]);
  return paginated((docs as InvoiceDoc[]).map((d) => toRow(d, now)), total, params);
}

/** Totals for the invoice list header, using the shared financial definitions. */
export async function invoiceSummary() {
  await connectToDatabase();
  const today = startOfDayIST(new Date());
  const [row] = await InvoiceModel.aggregate<{
    invoiced: number;
    outstanding: number;
    overdue: number;
    overdueCount: number;
    drafts: number;
  }>([
    {
      $group: {
        _id: null,
        invoiced: { $sum: { $cond: [{ $in: ["$status", ["sent", "partially_paid", "paid"]] }, "$totals.totalPaise", 0] } },
        outstanding: { $sum: { $cond: [{ $in: ["$status", ["sent", "partially_paid"]] }, "$balancePaise", 0] } },
        overdue: {
          $sum: {
            $cond: [
              { $and: [{ $in: ["$status", ["sent", "partially_paid"]] }, { $lt: ["$dueDate", today] }, { $gt: ["$balancePaise", 0] }] },
              "$balancePaise",
              0,
            ],
          },
        },
        overdueCount: {
          $sum: {
            $cond: [
              { $and: [{ $in: ["$status", ["sent", "partially_paid"]] }, { $lt: ["$dueDate", today] }, { $gt: ["$balancePaise", 0] }] },
              1,
              0,
            ],
          },
        },
        drafts: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
      },
    },
  ]);
  return row ?? { invoiced: 0, outstanding: 0, overdue: 0, overdueCount: 0, drafts: 0 };
}

export async function getInvoice(_user: SessionUser, id: string): Promise<InvoiceDetail | null> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = (await InvoiceModel.findById(id).lean()) as InvoiceDoc | null;
  if (!doc) return null;
  const settings = doc.seller ? null : await getCompanySettings();
  const [names, project, payments] = await Promise.all([
    userNames([doc.createdBy]),
    doc.project ? ProjectModel.findById(doc.project).select("name").lean() : null,
    PaymentModel.find({ invoice: doc._id }).sort({ paidAt: 1, createdAt: 1 }).lean(),
  ]);
  const seller: Seller | null = doc.seller
    ? {
        name: doc.seller.name,
        address: doc.seller.address ?? "",
        stateName: doc.seller.stateName ?? "",
        stateCode: doc.seller.stateCode ?? "",
        gstin: doc.seller.gstin ?? "",
        gstRegistered: Boolean(doc.seller.gstRegistered),
        email: doc.seller.email ?? "",
        phone: doc.seller.phone ?? "",
      }
    : settings
      ? sellerSnapshot(settings)
      : null;
  const taxMode = doc.taxMode as TaxMode;
  return {
    ...toRow(doc, new Date()),
    title: invoiceTitle({ gstRegistered: Boolean(seller?.gstRegistered), gstin: seller?.gstin, taxMode }),
    billTo: toBillTo(doc.billTo),
    seller,
    taxMode,
    placeOfSupply: doc.placeOfSupply ?? "",
    items: doc.items.map(toDocumentLine),
    totals: toTotals(doc.totals),
    terms: doc.terms ?? "",
    notes: doc.notes ?? "",
    projectId: idOrNull(doc.project),
    projectName: project?.name ?? null,
    quotationId: idOrNull(doc.quotation),
    issuedAt: isoOrNull(doc.issuedAt),
    sentAt: isoOrNull(doc.sentAt),
    paidAt: isoOrNull(doc.paidAt),
    cancelledAt: isoOrNull(doc.cancelledAt),
    cancelReason: doc.cancelReason ?? "",
    createdByName: names.get(doc.createdBy.toString()) ?? null,
    payments: payments.map((p) => ({
      id: p._id.toString(),
      paymentNumber: p.paymentNumber,
      paidAt: p.paidAt.toISOString(),
      amountPaise: p.amountPaise,
      method: p.method as PaymentMethod,
      methodLabel: PAYMENT_METHOD_LABELS[p.method as PaymentMethod],
      transactionReference: p.transactionReference ?? "",
      status: p.status as PaymentStatus,
    })),
  };
}

async function assertProject(projectId: string | null, customerId: string) {
  if (!projectId) return;
  const project = await ProjectModel.findById(projectId).select("customer").lean();
  if (!project) throw new NotFoundError("Project");
  if (project.customer.toString() !== customerId) {
    throw new ConflictError("The selected project belongs to a different customer.");
  }
}

export async function createInvoice(user: SessionUser, data: InvoiceFormData) {
  await connectToDatabase();
  const settings = await getCompanySettings();
  await assertProject(data.project, data.customer);
  const [{ customerId, ...billTo }, prepared] = await Promise.all([
    buildBillTo(data.customer),
    prepareLines(data.items, data.taxMode, settings),
  ]);
  const invoice = await InvoiceModel.create({
    customer: customerId,
    billTo,
    project: data.project ?? undefined,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    taxMode: data.taxMode,
    placeOfSupply: billTo.state,
    items: prepared.items,
    totals: prepared.totals,
    amountPaidPaise: 0,
    balancePaise: prepared.totals.totalPaise,
    terms: data.terms,
    notes: data.notes,
    status: "draft",
    createdBy: user.id,
  });
  await logActivity({
    actor: user,
    action: "invoice.draft_created",
    entityType: "invoice",
    entityId: invoice._id,
    entityLabel: "Draft invoice",
    message: `Created a draft invoice for ${billTo.businessName || billTo.name} (${formatINR(prepared.totals.totalPaise)})`,
  });
  return { id: invoice._id.toString() };
}

const ISSUED_LOCKED = "Issued invoices cannot be edited. Cancel it and issue a new invoice if a correction is needed.";

export async function updateInvoice(user: SessionUser, id: string, data: InvoiceFormData) {
  await connectToDatabase();
  const invoiceId = toObjectId(id, "Invoice");
  const existing = await InvoiceModel.findById(invoiceId).select("status").lean();
  if (!existing) throw new NotFoundError("Invoice");
  if (existing.status !== "draft") throw new ConflictError(ISSUED_LOCKED);
  const settings = await getCompanySettings();
  await assertProject(data.project, data.customer);
  const [{ customerId, ...billTo }, prepared] = await Promise.all([
    buildBillTo(data.customer),
    prepareLines(data.items, data.taxMode, settings),
  ]);
  // Single conditional write: if the invoice was issued meanwhile, nothing changes.
  const invoice = await InvoiceModel.findOneAndUpdate(
    { _id: invoiceId, status: "draft" },
    {
      $set: {
        customer: customerId,
        billTo,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        taxMode: data.taxMode,
        placeOfSupply: billTo.state,
        items: prepared.items,
        totals: prepared.totals,
        amountPaidPaise: 0,
        balancePaise: prepared.totals.totalPaise,
        terms: data.terms,
        notes: data.notes,
        ...(data.project ? { project: data.project } : {}),
      },
      ...(data.project ? {} : { $unset: { project: 1 } }),
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!invoice) throw new ConflictError(ISSUED_LOCKED);
  await logActivity({
    actor: user,
    action: "invoice.draft_updated",
    entityType: "invoice",
    entityId: invoice._id,
    entityLabel: "Draft invoice",
    message: `Updated a draft invoice (${formatINR(prepared.totals.totalPaise)})`,
  });
  return { id: invoice._id.toString() };
}

/**
 * Issues a draft: assigns the next number in the financial-year series,
 * freezes the seller details and makes the invoice payable. The number is
 * taken inside the transaction, so a failed issue never consumes one.
 */
export async function issueInvoice(user: SessionUser, id: string) {
  await connectToDatabase();
  const settings = await getCompanySettings();
  const invoiceId = toObjectId(id, "Invoice");

  const issued = await withTransaction(async (session) => {
    const invoice = await InvoiceModel.findById(invoiceId).session(session);
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.status !== "draft") throw new ConflictError("This invoice has already been issued.");
    if ((invoice.totals?.totalPaise ?? 0) <= 0) throw new BadRequestError("An invoice must have a total greater than zero.");
    if (invoice.issueDate.getTime() > endOfDayIST(new Date()).getTime()) {
      throw new BadRequestError("An invoice cannot be issued with a future invoice date. Change the date or issue it on that day.");
    }
    // Settings may have changed since the draft was saved.
    assertTaxTreatment(
      invoice.taxMode as TaxMode,
      invoice.items.map((i) => ({
        service: i.service?.toString() ?? null,
        description: i.description,
        sacCode: i.sacCode ?? "",
        quantity: i.quantity,
        unitPrice: i.unitPricePaise,
        discount: i.discountPaise ?? 0,
        taxRate: i.taxRateBps ?? 0,
      })),
      settings,
    );
    invoice.invoiceNumber = await nextDocumentNumber("invoice", settings.invoicePrefix, invoice.issueDate, session);
    invoice.seller = sellerSnapshot(settings);
    invoice.status = "sent";
    invoice.issuedAt = new Date();
    invoice.increment(); // bump the version so stale document saves cannot overwrite an issued invoice
    invoice.amountPaidPaise = 0;
    invoice.balancePaise = invoice.totals?.totalPaise ?? 0;
    await invoice.save({ session });
    await logActivity(
      {
        actor: user,
        action: "invoice.issued",
        entityType: "invoice",
        entityId: invoice._id,
        entityLabel: invoice.invoiceNumber,
        message: `Issued invoice ${invoice.invoiceNumber} for ${formatINR(invoice.totals?.totalPaise ?? 0)}`,
        sensitive: true,
      },
      session,
    );
    return { id: invoice._id.toString(), invoiceNumber: invoice.invoiceNumber };
  });
  return issued;
}

export async function cancelInvoice(user: SessionUser, id: string, reason: string) {
  await connectToDatabase();
  const result = await withTransaction(async (session) => {
    const invoice = await InvoiceModel.findById(toObjectId(id, "Invoice")).session(session);
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.status === "draft") throw new ConflictError("Delete the draft instead — it has no invoice number yet.");
    if (invoice.status === "cancelled") throw new ConflictError("This invoice is already cancelled.");
    const activePayments = await PaymentModel.countDocuments({ invoice: invoice._id, status: "recorded" }).session(session);
    if (activePayments > 0) {
      throw new ConflictError("This invoice has recorded payments. Void those payments before cancelling it.");
    }
    invoice.status = "cancelled";
    invoice.cancelledAt = new Date();
    invoice.cancelReason = reason;
    await invoice.save({ session });
    await logActivity(
      {
        actor: user,
        action: "invoice.cancelled",
        entityType: "invoice",
        entityId: invoice._id,
        entityLabel: invoice.invoiceNumber ?? undefined,
        message: `Cancelled invoice ${invoice.invoiceNumber}: ${reason}`,
        sensitive: true,
      },
      session,
    );
    return { id: invoice._id.toString() };
  });
  return result;
}

export async function deleteDraftInvoice(user: SessionUser, id: string) {
  await connectToDatabase();
  const invoice = await InvoiceModel.findOneAndDelete({ _id: toObjectId(id, "Invoice"), status: "draft" });
  if (!invoice) throw new ConflictError("Only draft invoices can be deleted. Issued invoices are kept for audit.");
  await logActivity({
    actor: user,
    action: "invoice.draft_deleted",
    entityType: "invoice",
    entityId: invoice._id,
    entityLabel: "Draft invoice",
    message: `Deleted a draft invoice for ${invoice.billTo?.businessName || invoice.billTo?.name} (${formatINR(invoice.totals?.totalPaise ?? 0)})`,
    sensitive: true,
  });
  return { ok: true };
}

export async function markInvoiceEmailed(user: SessionUser, id: string, to: string) {
  await InvoiceModel.updateOne({ _id: id }, { sentAt: new Date() });
  await logActivity({
    actor: user,
    action: "invoice.emailed",
    entityType: "invoice",
    entityId: id,
    message: `Emailed the invoice to ${to}`,
  });
}

/**
 * Recomputes an invoice's paid amount, balance and status from its recorded
 * payments. Always called inside the payment transaction.
 */
export async function recalculateInvoice(invoiceId: Types.ObjectId | string, session: ClientSession) {
  const invoice = await InvoiceModel.findById(invoiceId).session(session);
  if (!invoice) throw new NotFoundError("Invoice");
  const [sum] = await PaymentModel.aggregate<{ total: number }>([
    { $match: { invoice: invoice._id, status: "recorded" } },
    { $group: { _id: null, total: { $sum: "$amountPaise" } } },
  ]).session(session);
  const paid = sum?.total ?? 0;
  const total = invoice.totals?.totalPaise ?? 0;
  if (paid > total) throw new ConflictError("Payments would exceed the invoice total.");
  const previous = invoice.status as StoredInvoiceStatus;
  invoice.amountPaidPaise = paid;
  invoice.balancePaise = total - paid;
  invoice.status = statusForBalance(total, paid);
  invoice.paidAt = invoice.status === "paid" ? (invoice.paidAt ?? new Date()) : undefined;
  await invoice.save({ session });
  return { invoice, previous, status: invoice.status as StoredInvoiceStatus };
}

export function invoiceStatusLabel(status: InvoiceStatus) {
  return INVOICE_STATUS_LABELS[status];
}
