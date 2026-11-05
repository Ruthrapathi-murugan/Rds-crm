import "server-only";
import { Types } from "mongoose";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type CommunicationType,
  type CustomerType,
  type LeadSource,
  type LeadStatus,
} from "@/lib/constants";
import { ConflictError, isDuplicateKeyError, NotFoundError } from "@/lib/errors";
import { escapeRegex, paginated, skipFor } from "@/lib/list-params";
import { connectToDatabase, withTransaction } from "@/lib/mongodb";
import { endOfDayIST, startOfDayIST } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import type { ConvertLeadData, LeadFormData } from "@/lib/validations/lead";
import { CustomerModel } from "@/models/customer";
import { LeadModel, type LeadDoc } from "@/models/lead";
import { ProjectModel } from "@/models/project";
import { ServiceModel } from "@/models/service";
import type { ListParams, Option, Paginated, SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import { assertAssignableUser, assertServiceExists, idOrNull, isoOrNull, serviceNames, userNames } from "./lookup.service";
import { notify } from "./notification.service";
import { nextSimpleNumber } from "./numbering.service";
import { andFilters, ownershipFilter, toObjectId } from "./scope";

export const LEAD_SORTS = ["createdAt", "contactName", "estimatedValuePaise", "nextFollowUpAt", "status"] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export type LeadFilters = {
  status?: LeadStatus;
  source?: LeadSource;
  assignedTo?: string; // user id, "me" or "unassigned"
  followUp?: "overdue" | "today" | "upcoming";
  archived?: boolean;
};

export type LeadRow = {
  id: string;
  leadNumber: string;
  contactName: string;
  businessName: string;
  phone: string;
  email: string;
  source: LeadSource;
  status: LeadStatus;
  estimatedValuePaise: number;
  serviceName: string | null;
  assignedToName: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  archived: boolean;
  converted: boolean;
};

export type CommunicationEntry = {
  id: string;
  type: CommunicationType;
  summary: string;
  occurredAt: string;
  createdByName: string;
};

export type LeadDetail = LeadRow & {
  whatsapp: string;
  location: string;
  interestedServiceId: string | null;
  assignedToId: string | null;
  notes: string;
  lostReason: string;
  communications: CommunicationEntry[];
  convertedCustomerId: string | null;
  convertedAt: string | null;
  createdByName: string | null;
  updatedAt: string;
};

function baseFilter(user: SessionUser, filters: LeadFilters, now: Date) {
  const filter: Record<string, unknown> = { archivedAt: filters.archived ? { $ne: null } : null };
  if (filters.status) filter.status = filters.status;
  if (filters.source) filter.source = filters.source;
  if (filters.assignedTo === "unassigned") filter.assignedTo = null;
  else if (filters.assignedTo === "me") filter.assignedTo = new Types.ObjectId(user.id);
  else if (filters.assignedTo && Types.ObjectId.isValid(filters.assignedTo)) {
    filter.assignedTo = new Types.ObjectId(filters.assignedTo);
  }
  if (filters.followUp) {
    const start = startOfDayIST(now);
    const end = endOfDayIST(now);
    filter.status ??= { $nin: ["won", "lost"] };
    if (filters.followUp === "overdue") filter.nextFollowUpAt = { $lt: start };
    if (filters.followUp === "today") filter.nextFollowUpAt = { $gte: start, $lte: end };
    if (filters.followUp === "upcoming") filter.nextFollowUpAt = { $gt: end };
  }
  return andFilters(filter, ownershipFilter(user));
}

function searchClause(q: string) {
  if (!q) return {};
  const re = new RegExp(escapeRegex(q), "i");
  return {
    $or: [{ contactName: re }, { businessName: re }, { phone: re }, { whatsapp: re }, { email: re }, { leadNumber: re }, { location: re }],
  };
}

async function toRows(docs: LeadDoc[]): Promise<LeadRow[]> {
  const [users, services] = await Promise.all([
    userNames(docs.map((d) => d.assignedTo)),
    serviceNames(docs.map((d) => d.interestedService)),
  ]);
  return docs.map((d) => toRow(d, users, services));
}

function toRow(d: LeadDoc, users: Map<string, string>, services: Map<string, string>): LeadRow {
  return {
    id: d._id.toString(),
    leadNumber: d.leadNumber,
    contactName: d.contactName,
    businessName: d.businessName ?? "",
    phone: d.phone,
    email: d.email ?? "",
    source: d.source as LeadSource,
    status: d.status as LeadStatus,
    estimatedValuePaise: d.estimatedValuePaise ?? 0,
    serviceName: d.interestedService ? (services.get(d.interestedService.toString()) ?? null) : null,
    assignedToName: d.assignedTo ? (users.get(d.assignedTo.toString()) ?? null) : null,
    nextFollowUpAt: isoOrNull(d.nextFollowUpAt),
    createdAt: d.createdAt.toISOString(),
    archived: Boolean(d.archivedAt),
    converted: Boolean(d.convertedCustomer),
  };
}

export async function listLeads(
  user: SessionUser,
  params: ListParams<LeadSort>,
  filters: LeadFilters = {},
): Promise<Paginated<LeadRow>> {
  await connectToDatabase();
  const filter = andFilters(baseFilter(user, filters, new Date()), searchClause(params.q));
  const sort: Record<string, 1 | -1> = { [params.sort]: params.dir === "asc" ? 1 : -1, _id: -1 };
  const [docs, total] = await Promise.all([
    LeadModel.find(filter).sort(sort).skip(skipFor(params)).limit(params.pageSize).lean(),
    LeadModel.countDocuments(filter),
  ]);
  return paginated(await toRows(docs as LeadDoc[]), total, params);
}

/** Counts per status for the pipeline strip (respects record visibility). */
export async function leadStatusCounts(user: SessionUser): Promise<Record<LeadStatus, number>> {
  await connectToDatabase();
  const rows = await LeadModel.aggregate<{ _id: LeadStatus; count: number }>([
    { $match: andFilters({ archivedAt: null }, ownershipFilter(user)) },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(Object.keys(LEAD_STATUS_LABELS).map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

async function findVisibleLead(user: SessionUser, id: string) {
  const lead = await LeadModel.findOne(andFilters({ _id: toObjectId(id, "Lead") }, ownershipFilter(user)));
  if (!lead) throw new NotFoundError("Lead");
  return lead;
}

export async function getLead(user: SessionUser, id: string): Promise<LeadDetail | null> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = (await LeadModel.findOne(andFilters({ _id: new Types.ObjectId(id) }, ownershipFilter(user))).lean()) as LeadDoc | null;
  if (!doc) return null;

  const [users, services] = await Promise.all([
    userNames([doc.assignedTo, doc.createdBy, ...doc.communications.map((c) => c.createdBy)]),
    serviceNames([doc.interestedService]),
  ]);
  return {
    ...toRow(doc, users, services),
    whatsapp: doc.whatsapp ?? "",
    location: doc.location ?? "",
    interestedServiceId: idOrNull(doc.interestedService),
    assignedToId: idOrNull(doc.assignedTo),
    notes: doc.notes ?? "",
    lostReason: doc.lostReason ?? "",
    communications: [...doc.communications]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((c) => ({
        id: (c as { _id?: Types.ObjectId })._id?.toString() ?? `${c.occurredAt.getTime()}`,
        type: c.type as CommunicationType,
        summary: c.summary,
        occurredAt: c.occurredAt.toISOString(),
        createdByName: users.get(c.createdBy.toString()) ?? "Unknown",
      })),
    convertedCustomerId: idOrNull(doc.convertedCustomer),
    convertedAt: isoOrNull(doc.convertedAt),
    createdByName: users.get(doc.createdBy.toString()) ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function leadFields(data: LeadFormData) {
  return {
    contactName: data.contactName,
    businessName: data.businessName,
    phone: data.phone,
    whatsapp: data.whatsapp,
    email: data.email,
    location: data.location,
    // undefined (not null) clears optional fields on update.
    interestedService: data.interestedService ?? undefined,
    source: data.source,
    estimatedValuePaise: data.estimatedValue,
    assignedTo: data.assignedTo ?? undefined,
    nextFollowUpAt: data.nextFollowUpAt ?? undefined,
    notes: data.notes,
  };
}

export async function createLead(user: SessionUser, data: LeadFormData) {
  await connectToDatabase();
  await Promise.all([assertAssignableUser(data.assignedTo), assertServiceExists(data.interestedService, "interestedService")]);
  // A new lead cannot start as converted; "won" is reached through conversion.
  const status = data.status === "won" ? "qualified" : data.status;
  const lead = await LeadModel.create({
    ...leadFields(data),
    status,
    leadNumber: await nextSimpleNumber("lead"),
    createdBy: user.id,
  });
  await logActivity({
    actor: user,
    action: "lead.created",
    entityType: "lead",
    entityId: lead._id,
    entityLabel: lead.contactName,
    message: `Created lead ${lead.leadNumber} for ${lead.contactName}`,
  });
  await notify(
    data.assignedTo,
    { type: "lead.assigned", title: `New lead assigned: ${lead.contactName}`, message: lead.businessName ?? "", link: `/leads/${lead._id}` },
    user,
  );
  return { id: lead._id.toString(), leadNumber: lead.leadNumber };
}

export async function updateLead(user: SessionUser, id: string, data: LeadFormData) {
  await connectToDatabase();
  const lead = await findVisibleLead(user, id);
  await Promise.all([assertAssignableUser(data.assignedTo), assertServiceExists(data.interestedService, "interestedService")]);
  const previousAssignee = lead.assignedTo?.toString() ?? null;
  const previousStatus = lead.status;
  // Status "won" is only set by conversion; keep a converted lead "won".
  const status = lead.convertedCustomer ? "won" : data.status === "won" ? previousStatus : data.status;
  lead.set({ ...leadFields(data), status });
  await lead.save();

  await logActivity({
    actor: user,
    action: "lead.updated",
    entityType: "lead",
    entityId: lead._id,
    entityLabel: lead.contactName,
    message:
      previousStatus !== status
        ? `Updated lead and changed status from ${LEAD_STATUS_LABELS[previousStatus as LeadStatus]} to ${LEAD_STATUS_LABELS[status as LeadStatus]}`
        : "Updated lead details",
  });
  if (data.assignedTo && data.assignedTo !== previousAssignee) {
    await notify(
      data.assignedTo,
      { type: "lead.assigned", title: `Lead assigned to you: ${lead.contactName}`, link: `/leads/${lead._id}` },
      user,
    );
  }
  return { id: lead._id.toString() };
}

export async function changeLeadStatus(
  user: SessionUser,
  id: string,
  input: { status: LeadStatus; lostReason: string; nextFollowUpAt: Date | null },
) {
  await connectToDatabase();
  const lead = await findVisibleLead(user, id);
  if (lead.convertedCustomer) throw new ConflictError("This lead has already been converted to a customer.");
  if (input.status === "won") {
    throw new ConflictError("Use “Convert to customer” to mark a lead as won.");
  }
  const previous = lead.status as LeadStatus;
  lead.status = input.status;
  if (input.status === "lost") lead.lostReason = input.lostReason;
  if (input.nextFollowUpAt) lead.nextFollowUpAt = input.nextFollowUpAt;
  await lead.save();
  await logActivity({
    actor: user,
    action: "lead.status_changed",
    entityType: "lead",
    entityId: lead._id,
    entityLabel: lead.contactName,
    message: `Changed status from ${LEAD_STATUS_LABELS[previous]} to ${LEAD_STATUS_LABELS[input.status]}${
      input.status === "lost" && input.lostReason ? ` (${input.lostReason})` : ""
    }`,
    meta: { from: previous, to: input.status },
  });
  return { id: lead._id.toString(), status: input.status };
}

export async function addLeadCommunication(
  user: SessionUser,
  id: string,
  input: { type: CommunicationType; summary: string; occurredAt: Date; nextFollowUpAt: Date | null },
) {
  await connectToDatabase();
  const lead = await findVisibleLead(user, id);
  lead.communications.push({ type: input.type, summary: input.summary, occurredAt: input.occurredAt, createdBy: new Types.ObjectId(user.id) });
  if (input.nextFollowUpAt) lead.nextFollowUpAt = input.nextFollowUpAt;
  if (lead.status === "new") lead.status = "contacted";
  await lead.save();
  await logActivity({
    actor: user,
    action: "lead.communication_added",
    entityType: "lead",
    entityId: lead._id,
    entityLabel: lead.contactName,
    message: `Logged a ${input.type.replace("_", " ")} with ${lead.contactName}`,
  });
  return { ok: true };
}

export async function setLeadArchived(user: SessionUser, id: string, archived: boolean) {
  await connectToDatabase();
  const lead = await findVisibleLead(user, id);
  lead.archivedAt = archived ? new Date() : undefined;
  await lead.save();
  await logActivity({
    actor: user,
    action: archived ? "lead.archived" : "lead.restored",
    entityType: "lead",
    entityId: lead._id,
    entityLabel: lead.contactName,
    message: archived ? `Archived lead ${lead.leadNumber}` : `Restored lead ${lead.leadNumber}`,
  });
  return { id: lead._id.toString(), archived };
}

/**
 * Converts a lead into a customer (and optionally a project) atomically.
 * Duplicate conversion is prevented twice over: the lead is checked inside
 * the transaction, and Customer.sourceLead has a unique index, so even two
 * simultaneous requests cannot create two customers.
 */
export async function convertLead(user: SessionUser, id: string, input: ConvertLeadData) {
  await connectToDatabase();
  const leadId = toObjectId(id, "Lead");
  if (input.createProject) await assertServiceExists(input.projectService, "projectService");

  try {
    const result = await withTransaction(async (session) => {
      const lead = await LeadModel.findOne(andFilters({ _id: leadId }, ownershipFilter(user))).session(session);
      if (!lead) throw new NotFoundError("Lead");
      if (lead.convertedCustomer) throw new ConflictError("This lead has already been converted to a customer.");
      if (lead.archivedAt) throw new ConflictError("Restore this lead before converting it.");

      const [customer] = await CustomerModel.create(
        [
          {
            customerNumber: await nextSimpleNumber("customer", session),
            name: lead.contactName,
            businessName: lead.businessName,
            phone: lead.phone,
            whatsapp: lead.whatsapp,
            email: lead.email,
            city: lead.location,
            type: input.customerType as CustomerType,
            servicesPurchased: lead.interestedService ? [lead.interestedService] : [],
            notes: lead.notes,
            sourceLead: lead._id,
            createdBy: user.id,
          },
        ],
        { session },
      );

      let projectId: string | null = null;
      if (input.createProject) {
        const serviceId = input.projectService ?? lead.interestedService?.toString() ?? null;
        const service = serviceId ? await ServiceModel.findById(serviceId).session(session).lean() : null;
        const [project] = await ProjectModel.create(
          [
            {
              projectNumber: await nextSimpleNumber("project", session),
              name: input.projectName,
              customer: customer._id,
              service: service?._id,
              category: service?.category ?? "web_development",
              quotedAmountPaise: input.quotedAmount || lead.estimatedValuePaise || 0,
              assignedTo: lead.assignedTo,
              sourceLead: lead._id,
              createdBy: user.id,
            },
          ],
          { session },
        );
        projectId = project._id.toString();
      }

      lead.status = "won";
      lead.convertedCustomer = customer._id;
      lead.convertedAt = new Date();
      await lead.save({ session });

      await logActivity(
        {
          actor: user,
          action: "lead.converted",
          entityType: "lead",
          entityId: lead._id,
          entityLabel: lead.contactName,
          message: `Converted lead ${lead.leadNumber} to customer ${customer.customerNumber}${projectId ? " and created a project" : ""}`,
          meta: { customerId: customer._id.toString(), projectId },
        },
        session,
      );
      await logActivity(
        {
          actor: user,
          action: "customer.created",
          entityType: "customer",
          entityId: customer._id,
          entityLabel: customer.name,
          message: `Created from lead ${lead.leadNumber}`,
        },
        session,
      );
      return { customerId: customer._id.toString(), projectId };
    });
    return result;
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new ConflictError("This lead has already been converted to a customer.");
    throw error;
  }
}

/** Search for task/quotation pickers. */
export async function leadOptions(user: SessionUser, q: string): Promise<Option[]> {
  await connectToDatabase();
  const docs = await LeadModel.find(andFilters({ archivedAt: null }, searchClause(q.trim().slice(0, 60)), ownershipFilter(user)))
    .select("leadNumber contactName businessName estimatedValuePaise")
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();
  return docs.map((d) => ({
    value: d._id.toString(),
    label: d.contactName,
    description: [d.leadNumber, d.businessName, d.estimatedValuePaise ? formatINR(d.estimatedValuePaise) : ""].filter(Boolean).join(" · "),
  }));
}

export { LEAD_SOURCE_LABELS };
