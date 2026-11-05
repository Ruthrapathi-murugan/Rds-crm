import "server-only";
import { Types } from "mongoose";
import { addDays } from "date-fns";
import { QUOTATION_STATUS_LABELS, type QuotationStatus, type TaxMode } from "@/lib/constants";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { escapeRegex, paginated, skipFor } from "@/lib/list-params";
import { connectToDatabase, withTransaction } from "@/lib/mongodb";
import { isPastDueDate, startOfDayIST } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import type { QuotationFormData } from "@/lib/validations/finance";
import { InvoiceModel } from "@/models/invoice";
import { LeadModel } from "@/models/lead";
import { ProjectModel } from "@/models/project";
import { QuotationModel, type QuotationDoc } from "@/models/quotation";
import type { ListParams, Paginated, SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import {
  buildBillTo,
  prepareLines,
  toBillTo,
  toDocumentLine,
  toTotals,
  type BillTo,
  type DocumentLine,
  type DocumentTotals,
} from "./finance/documents";
import { idOrNull, isoOrNull, userNames } from "./lookup.service";
import { nextDocumentNumber } from "./numbering.service";
import { andFilters, ownershipFilter, toObjectId } from "./scope";
import { getCompanySettings } from "./settings.service";

export const QUOTATION_SORTS = ["issueDate", "quotationNumber", "validUntil", "totals.totalPaise"] as const;
export type QuotationSort = (typeof QUOTATION_SORTS)[number];

/** Statuses that can still be edited. */
const EDITABLE: QuotationStatus[] = ["draft", "sent"];

/** Allowed manual status changes. "converted" only happens through conversion. */
const TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "draft"],
  accepted: ["sent"],
  rejected: ["sent"],
  expired: ["sent"],
  converted: [],
};

export type QuotationRow = {
  id: string;
  quotationNumber: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  validUntil: string;
  totalPaise: number;
  status: QuotationStatus;
  storedStatus: QuotationStatus;
};

export type QuotationDetail = QuotationRow & {
  billTo: BillTo;
  taxMode: TaxMode;
  items: DocumentLine[];
  totals: DocumentTotals;
  terms: string;
  notes: string;
  leadId: string | null;
  leadName: string | null;
  projectId: string | null;
  projectName: string | null;
  convertedInvoiceId: string | null;
  createdByName: string | null;
  sentAt: string | null;
  editable: boolean;
  allowedTransitions: QuotationStatus[];
};

/** A draft or sent quotation past its validity date is shown as expired. */
export function effectiveQuotationStatus(status: QuotationStatus, validUntil: Date, now: Date): QuotationStatus {
  return (status === "draft" || status === "sent") && isPastDueDate(validUntil, now) ? "expired" : status;
}

function toRow(doc: QuotationDoc, now: Date): QuotationRow {
  const stored = doc.status as QuotationStatus;
  return {
    id: doc._id.toString(),
    quotationNumber: doc.quotationNumber,
    customerId: doc.customer.toString(),
    customerName: doc.billTo?.businessName || doc.billTo?.name || "",
    issueDate: doc.issueDate.toISOString(),
    validUntil: doc.validUntil.toISOString(),
    totalPaise: doc.totals?.totalPaise ?? 0,
    status: effectiveQuotationStatus(stored, doc.validUntil, now),
    storedStatus: stored,
  };
}

/** Staff (no records:all) only see quotations they created. */
export const quotationScope = (user: SessionUser) => ownershipFilter(user, ["createdBy"]);

export async function listQuotations(
  user: SessionUser,
  params: ListParams<QuotationSort>,
  filters: { status?: QuotationStatus; customer?: string } = {},
): Promise<Paginated<QuotationRow>> {
  await connectToDatabase();
  const now = new Date();
  const filter: Record<string, unknown> = {};
  if (filters.customer && Types.ObjectId.isValid(filters.customer)) filter.customer = new Types.ObjectId(filters.customer);
  if (filters.status === "expired") {
    filter.status = { $in: ["draft", "sent"] };
    filter.validUntil = { $lt: startOfDayIST(now) };
  } else if (filters.status === "draft" || filters.status === "sent") {
    filter.status = filters.status;
    filter.validUntil = { $gte: startOfDayIST(now) };
  } else if (filters.status) {
    filter.status = filters.status;
  }
  const q = params.q ? new RegExp(escapeRegex(params.q), "i") : null;
  const query = andFilters(
    filter,
    q ? { $or: [{ quotationNumber: q }, { "billTo.name": q }, { "billTo.businessName": q }] } : {},
    quotationScope(user),
  );
  const sort: Record<string, 1 | -1> = { [params.sort]: params.dir === "asc" ? 1 : -1, _id: -1 };
  const [docs, total] = await Promise.all([
    QuotationModel.find(query).sort(sort).skip(skipFor(params)).limit(params.pageSize).lean(),
    QuotationModel.countDocuments(query),
  ]);
  return paginated((docs as QuotationDoc[]).map((d) => toRow(d, now)), total, params);
}

export async function getQuotation(user: SessionUser, id: string): Promise<QuotationDetail | null> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = (await QuotationModel.findOne(andFilters({ _id: new Types.ObjectId(id) }, quotationScope(user))).lean()) as QuotationDoc | null;
  if (!doc) return null;
  const now = new Date();
  // Linked lead/project names are only shown if the user may see those records.
  const [names, lead, project] = await Promise.all([
    userNames([doc.createdBy]),
    doc.lead ? LeadModel.findOne(andFilters({ _id: doc.lead }, ownershipFilter(user))).select("contactName").lean() : null,
    doc.project ? ProjectModel.findOne(andFilters({ _id: doc.project }, ownershipFilter(user))).select("name").lean() : null,
  ]);
  const row = toRow(doc, now);
  return {
    ...row,
    billTo: toBillTo(doc.billTo),
    taxMode: doc.taxMode as TaxMode,
    items: doc.items.map(toDocumentLine),
    totals: toTotals(doc.totals),
    terms: doc.terms ?? "",
    notes: doc.notes ?? "",
    leadId: idOrNull(doc.lead),
    leadName: lead?.contactName ?? null,
    projectId: idOrNull(doc.project),
    projectName: project?.name ?? null,
    convertedInvoiceId: idOrNull(doc.convertedInvoice),
    createdByName: names.get(doc.createdBy.toString()) ?? null,
    sentAt: isoOrNull(doc.sentAt),
    editable: EDITABLE.includes(row.storedStatus),
    allowedTransitions: TRANSITIONS[row.storedStatus],
  };
}

async function assertLinks(data: QuotationFormData) {
  if (data.lead && !(await LeadModel.exists({ _id: data.lead }))) {
    throw new NotFoundError("Lead");
  }
  if (data.project) {
    const project = await ProjectModel.findById(data.project).select("customer").lean();
    if (!project) throw new NotFoundError("Project");
    if (project.customer.toString() !== data.customer) {
      throw new ConflictError("The selected project belongs to a different customer.");
    }
  }
}

export async function createQuotation(user: SessionUser, data: QuotationFormData) {
  await connectToDatabase();
  const settings = await getCompanySettings();
  await assertLinks(data);
  const [{ customerId, ...billTo }, prepared] = await Promise.all([
    buildBillTo(data.customer),
    prepareLines(data.items, data.taxMode, settings),
  ]);

  const quotation = await withTransaction(async (session) => {
    const [created] = await QuotationModel.create(
      [
        {
          quotationNumber: await nextDocumentNumber("quotation", settings.quotationPrefix, data.issueDate, session),
          customer: customerId,
          billTo,
          lead: data.lead ?? undefined,
          project: data.project ?? undefined,
          issueDate: data.issueDate,
          validUntil: data.validUntil,
          taxMode: data.taxMode,
          items: prepared.items,
          totals: prepared.totals,
          terms: data.terms,
          notes: data.notes,
          status: "draft",
          createdBy: user.id,
        },
      ],
      { session },
    );
    return created;
  });

  await logActivity({
    actor: user,
    action: "quotation.created",
    entityType: "quotation",
    entityId: quotation._id,
    entityLabel: quotation.quotationNumber,
    message: `Created quotation ${quotation.quotationNumber} for ${billTo.businessName || billTo.name} (${formatINR(prepared.totals.totalPaise)})`,
  });
  return { id: quotation._id.toString(), quotationNumber: quotation.quotationNumber };
}

export async function updateQuotation(user: SessionUser, id: string, data: QuotationFormData) {
  await connectToDatabase();
  const quotationId = toObjectId(id, "Quotation");
  const existing = await QuotationModel.findById(quotationId).select("status").lean();
  if (!existing) throw new NotFoundError("Quotation");
  if (!EDITABLE.includes(existing.status as QuotationStatus)) {
    throw new ConflictError(`A ${QUOTATION_STATUS_LABELS[existing.status as QuotationStatus].toLowerCase()} quotation cannot be edited.`);
  }
  const settings = await getCompanySettings();
  await assertLinks(data);
  const [{ customerId, ...billTo }, prepared] = await Promise.all([
    buildBillTo(data.customer),
    prepareLines(data.items, data.taxMode, settings),
  ]);
  // Single conditional write: a quotation converted or accepted meanwhile is left untouched.
  const unset: Record<string, 1> = {};
  if (!data.lead) unset.lead = 1;
  if (!data.project) unset.project = 1;
  const quotation = await QuotationModel.findOneAndUpdate(
    { _id: quotationId, status: { $in: EDITABLE } },
    {
      $set: {
        customer: customerId,
        billTo,
        issueDate: data.issueDate,
        validUntil: data.validUntil,
        taxMode: data.taxMode,
        items: prepared.items,
        totals: prepared.totals,
        terms: data.terms,
        notes: data.notes,
        ...(data.lead ? { lead: data.lead } : {}),
        ...(data.project ? { project: data.project } : {}),
      },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!quotation) throw new ConflictError("This quotation was converted or closed while you were editing it.");
  await logActivity({
    actor: user,
    action: "quotation.updated",
    entityType: "quotation",
    entityId: quotation._id,
    entityLabel: quotation.quotationNumber,
    message: `Updated quotation ${quotation.quotationNumber} (${formatINR(prepared.totals.totalPaise)})`,
  });
  return { id: quotation._id.toString() };
}

export async function setQuotationStatus(user: SessionUser, id: string, status: QuotationStatus) {
  await connectToDatabase();
  const quotation = await QuotationModel.findById(toObjectId(id, "Quotation"));
  if (!quotation) throw new NotFoundError("Quotation");
  const current = quotation.status as QuotationStatus;
  if (!TRANSITIONS[current].includes(status)) {
    throw new ConflictError(`A ${QUOTATION_STATUS_LABELS[current].toLowerCase()} quotation cannot be marked ${QUOTATION_STATUS_LABELS[status].toLowerCase()}.`);
  }
  quotation.status = status;
  if (status === "sent") quotation.sentAt ??= new Date();
  await quotation.save();

  // Keep the related lead's pipeline in step.
  if (status === "sent" && quotation.lead) {
    await LeadModel.updateOne(
      { _id: quotation.lead, status: { $in: ["new", "contacted", "qualified", "follow_up"] }, convertedCustomer: null },
      { status: "quotation_sent" },
    );
  }

  await logActivity({
    actor: user,
    action: "quotation.status_changed",
    entityType: "quotation",
    entityId: quotation._id,
    entityLabel: quotation.quotationNumber,
    message: `Marked quotation ${quotation.quotationNumber} as ${QUOTATION_STATUS_LABELS[status].toLowerCase()}`,
    meta: { from: current, to: status },
  });
  return { id: quotation._id.toString(), status };
}

/**
 * Creates a draft invoice from a quotation, once. The quotation is marked
 * "converted" in the same transaction, so a double click cannot create two.
 */
export async function convertQuotationToInvoice(user: SessionUser, id: string) {
  await connectToDatabase();
  const settings = await getCompanySettings();
  const quotationId = toObjectId(id, "Quotation");

  const result = await withTransaction(async (session) => {
    const quotation = await QuotationModel.findOneAndUpdate(
      { _id: quotationId, status: { $in: ["sent", "accepted"] }, convertedInvoice: null },
      { status: "converted" },
      { session, returnDocument: "before" },
    );
    if (!quotation) {
      const existing = await QuotationModel.findById(quotationId).session(session).lean();
      if (!existing) throw new NotFoundError("Quotation");
      if (existing.convertedInvoice) throw new ConflictError("This quotation has already been converted to an invoice.");
      throw new ConflictError("Only sent or accepted quotations can be converted to an invoice.");
    }
    const { customerId, ...billTo } = await buildBillTo(quotation.customer.toString(), session);
    const today = startOfDayIST(new Date());
    const [invoice] = await InvoiceModel.create(
      [
        {
          customer: customerId,
          billTo,
          project: quotation.project,
          quotation: quotation._id,
          issueDate: today,
          dueDate: addDays(today, settings.defaultPaymentTermsDays),
          taxMode: quotation.taxMode,
          placeOfSupply: billTo.state,
          items: quotation.items,
          totals: quotation.totals,
          amountPaidPaise: 0,
          balancePaise: quotation.totals?.totalPaise ?? 0,
          terms: settings.invoiceTerms,
          notes: quotation.notes,
          status: "draft",
          createdBy: user.id,
        },
      ],
      { session },
    );
    await QuotationModel.updateOne({ _id: quotation._id }, { convertedInvoice: invoice._id }, { session });
    await logActivity(
      {
        actor: user,
        action: "quotation.converted",
        entityType: "quotation",
        entityId: quotation._id,
        entityLabel: quotation.quotationNumber,
        message: `Converted quotation ${quotation.quotationNumber} to a draft invoice`,
        meta: { invoiceId: invoice._id.toString() },
      },
      session,
    );
    return { invoiceId: invoice._id.toString() };
  });
  return result;
}

export async function deleteDraftQuotation(user: SessionUser, id: string) {
  await connectToDatabase();
  const quotation = await QuotationModel.findOneAndDelete({ _id: toObjectId(id, "Quotation"), status: "draft" });
  if (!quotation) throw new ConflictError("Only draft quotations can be deleted.");
  await logActivity({
    actor: user,
    action: "quotation.deleted",
    entityType: "quotation",
    entityId: quotation._id,
    entityLabel: quotation.quotationNumber,
    message: `Deleted draft quotation ${quotation.quotationNumber}`,
    sensitive: true,
  });
  return { ok: true };
}
