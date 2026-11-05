import "server-only";
import { Types } from "mongoose";
import {
  ACTIVE_PROJECT_STATUSES,
  CUSTOMER_STATUS_LABELS,
  RECEIVABLE_INVOICE_STATUSES,
  stateCodeOf,
  type CommunicationType,
  type CustomerStatus,
  type CustomerType,
  type InvoiceStatus,
  type PaymentMethod,
  type PaymentStatus,
  type Priority,
  type ProjectStatus,
  type QuotationStatus,
  type StoredInvoiceStatus,
  type TaskStatus,
} from "@/lib/constants";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { effectiveInvoiceStatus } from "@/lib/finance/invoice-status";
import { escapeRegex, paginated, skipFor } from "@/lib/list-params";
import { connectToDatabase } from "@/lib/mongodb";
import { hasPermission } from "@/lib/permissions";
import type { CustomerFormData } from "@/lib/validations/customer";
import { CustomerModel, type CustomerDoc } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { ProjectModel } from "@/models/project";
import { QuotationModel } from "@/models/quotation";
import { ServiceModel } from "@/models/service";
import { TaskModel } from "@/models/task";
import type { ListParams, Option, Paginated, SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import { isoOrNull, serviceNames, userNames } from "./lookup.service";
import type { CommunicationEntry } from "./lead.service";
import { nextSimpleNumber } from "./numbering.service";
import { andFilters, ownershipFilter, toObjectId } from "./scope";

export const CUSTOMER_SORTS = ["createdAt", "name", "businessName", "city", "status", "customerNumber"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

/** Invoices that count towards "invoiced": issued and not cancelled. */
export const INVOICED_STATUSES = ["sent", "partially_paid", "paid"] as const satisfies readonly StoredInvoiceStatus[];

/** Number of related records shown per tab on the customer page. */
const RELATED_LIMIT = 50;

export type CustomerFilters = {
  type?: CustomerType;
  status?: CustomerStatus;
  archived?: boolean;
};

export type CustomerRow = {
  id: string;
  customerNumber: string;
  name: string;
  businessName: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  type: CustomerType;
  status: CustomerStatus;
  servicesCount: number;
  createdAt: string;
  archived: boolean;
};

export type CustomerFinancialSummary = {
  /** Issued invoices (sent, partially paid, paid). */
  invoicedPaise: number;
  /** Recorded (not voided) payments. */
  receivedPaise: number;
  /** Balance on sent and partially paid invoices. */
  outstandingPaise: number;
};

export type CustomerProjectItem = {
  id: string;
  projectNumber: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  dueDate: string | null;
};

export type CustomerQuotationItem = {
  id: string;
  quotationNumber: string;
  issueDate: string;
  totalPaise: number;
  status: QuotationStatus;
};

export type CustomerInvoiceItem = {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalPaise: number;
  balancePaise: number;
  status: InvoiceStatus;
};

export type CustomerPaymentItem = {
  id: string;
  paymentNumber: string;
  paidAt: string;
  amountPaise: number;
  method: PaymentMethod;
  status: PaymentStatus;
  invoiceId: string | null;
};

export type CustomerTaskItem = {
  id: string;
  title: string;
  dueAt: string;
  status: TaskStatus;
  priority: Priority;
  assigneeName: string | null;
};

export type CustomerDetail = CustomerRow & {
  address: string;
  state: string;
  pincode: string;
  gstin: string;
  notes: string;
  services: { id: string; name: string }[];
  communications: CommunicationEntry[];
  sourceLeadId: string | null;
  createdByName: string | null;
  updatedAt: string;
  activeProjects: number;
  /** Null when the viewer cannot see invoices. */
  financials: CustomerFinancialSummary | null;
  projects: CustomerProjectItem[];
  /** Null when the viewer lacks the matching read permission. */
  quotations: CustomerQuotationItem[] | null;
  invoices: CustomerInvoiceItem[] | null;
  payments: CustomerPaymentItem[] | null;
  tasks: CustomerTaskItem[] | null;
};

export type CustomerBillingSnapshot = {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  gstin: string;
};

function searchClause(q: string) {
  if (!q) return {};
  const re = new RegExp(escapeRegex(q), "i");
  return {
    $or: [
      { name: re },
      { businessName: re },
      { phone: re },
      { whatsapp: re },
      { email: re },
      { customerNumber: re },
      { city: re },
    ],
  };
}

function baseFilter(filters: CustomerFilters) {
  const filter: Record<string, unknown> = { archivedAt: filters.archived ? { $ne: null } : null };
  if (filters.type) filter.type = filters.type;
  if (filters.status) filter.status = filters.status;
  return filter;
}

function toRow(d: CustomerDoc): CustomerRow {
  return {
    id: d._id.toString(),
    customerNumber: d.customerNumber,
    name: d.name,
    businessName: d.businessName ?? "",
    phone: d.phone,
    whatsapp: d.whatsapp ?? "",
    email: d.email ?? "",
    city: d.city ?? "",
    type: d.type as CustomerType,
    status: d.status as CustomerStatus,
    servicesCount: d.servicesPurchased?.length ?? 0,
    createdAt: d.createdAt.toISOString(),
    archived: Boolean(d.archivedAt),
  };
}

/** Customers are shared records: anyone with customers:read sees all of them. */
export async function listCustomers(
  _user: SessionUser,
  params: ListParams<CustomerSort>,
  filters: CustomerFilters = {},
): Promise<Paginated<CustomerRow>> {
  await connectToDatabase();
  const filter = andFilters(baseFilter(filters), searchClause(params.q));
  const sort: Record<string, 1 | -1> = { [params.sort]: params.dir === "asc" ? 1 : -1, _id: -1 };
  const [docs, total] = await Promise.all([
    CustomerModel.find(filter).select("-communications -notes").sort(sort).skip(skipFor(params)).limit(params.pageSize).lean(),
    CustomerModel.countDocuments(filter),
  ]);
  return paginated((docs as CustomerDoc[]).map(toRow), total, params);
}

/**
 * Money totals for one customer, straight from the ledgers:
 * invoiced = issued invoice totals, received = recorded payments,
 * outstanding = balances on invoices that still expect money.
 */
export async function customerFinancialSummary(customerId: string | Types.ObjectId): Promise<CustomerFinancialSummary> {
  await connectToDatabase();
  const customer = new Types.ObjectId(String(customerId));
  const [invoiceRows, paymentRows] = await Promise.all([
    InvoiceModel.aggregate<{ invoiced: number; outstanding: number }>([
      { $match: { customer, status: { $in: [...INVOICED_STATUSES] } } },
      {
        $group: {
          _id: null,
          invoiced: { $sum: "$totals.totalPaise" },
          outstanding: {
            $sum: { $cond: [{ $in: ["$status", [...RECEIVABLE_INVOICE_STATUSES]] }, "$balancePaise", 0] },
          },
        },
      },
    ]),
    PaymentModel.aggregate<{ received: number }>([
      { $match: { customer, status: "recorded" } },
      { $group: { _id: null, received: { $sum: "$amountPaise" } } },
    ]),
  ]);
  return {
    invoicedPaise: invoiceRows[0]?.invoiced ?? 0,
    receivedPaise: paymentRows[0]?.received ?? 0,
    outstandingPaise: invoiceRows[0]?.outstanding ?? 0,
  };
}

export async function getCustomer(user: SessionUser, id: string): Promise<CustomerDetail | null> {
  await connectToDatabase();
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const doc = (await CustomerModel.findById(id).lean()) as CustomerDoc | null;
  if (!doc) return null;
  const customer = doc._id;
  const now = new Date();

  const canQuotations = hasPermission(user, "quotations:read");
  const canInvoices = hasPermission(user, "invoices:read");
  const canPayments = hasPermission(user, "payments:read");
  const canTasks = hasPermission(user, "tasks:read");
  const canProjects = hasPermission(user, "projects:read");
  const projectFilter = andFilters({ customer, archivedAt: null }, ownershipFilter(user));

  const [projects, activeProjects, quotations, invoices, payments, tasks, financials, services] = await Promise.all([
    canProjects
      ? ProjectModel.find(projectFilter)
          .select("projectNumber name status progress dueDate")
          .sort({ createdAt: -1 })
          .limit(RELATED_LIMIT)
          .lean()
      : Promise.resolve([]),
    canProjects
      ? ProjectModel.countDocuments(andFilters(projectFilter, { status: { $in: [...ACTIVE_PROJECT_STATUSES] } }))
      : Promise.resolve(0),
    canQuotations
      ? QuotationModel.find({ customer })
          .select("quotationNumber issueDate totals.totalPaise status")
          .sort({ issueDate: -1, _id: -1 })
          .limit(RELATED_LIMIT)
          .lean()
      : Promise.resolve(null),
    canInvoices
      ? InvoiceModel.find({ customer })
          .select("invoiceNumber issueDate dueDate totals.totalPaise balancePaise status")
          .sort({ issueDate: -1, _id: -1 })
          .limit(RELATED_LIMIT)
          .lean()
      : Promise.resolve(null),
    canPayments
      ? PaymentModel.find({ customer })
          .select("paymentNumber paidAt amountPaise method status invoice")
          .sort({ paidAt: -1, _id: -1 })
          .limit(RELATED_LIMIT)
          .lean()
      : Promise.resolve(null),
    canTasks
      ? TaskModel.find(andFilters({ customer }, ownershipFilter(user)))
          .select("title dueAt status priority assignedTo")
          .sort({ dueAt: -1 })
          .limit(RELATED_LIMIT)
          .lean()
      : Promise.resolve(null),
    canInvoices ? customerFinancialSummary(customer) : Promise.resolve(null),
    serviceNames(doc.servicesPurchased ?? []),
  ]);

  const users = await userNames([
    doc.createdBy,
    ...doc.communications.map((c) => c.createdBy),
    ...(tasks ?? []).map((t) => t.assignedTo),
  ]);

  return {
    ...toRow(doc),
    address: doc.address ?? "",
    state: doc.state ?? "",
    pincode: doc.pincode ?? "",
    gstin: doc.gstin ?? "",
    notes: doc.notes ?? "",
    services: (doc.servicesPurchased ?? [])
      .map((sid) => ({ id: sid.toString(), name: services.get(sid.toString()) ?? "" }))
      .filter((s) => s.name),
    communications: [...doc.communications]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((c) => ({
        id: (c as { _id?: Types.ObjectId })._id?.toString() ?? `${c.occurredAt.getTime()}`,
        type: c.type as CommunicationType,
        summary: c.summary,
        occurredAt: c.occurredAt.toISOString(),
        createdByName: users.get(c.createdBy.toString()) ?? "Unknown",
      })),
    sourceLeadId: doc.sourceLead?.toString() ?? null,
    createdByName: users.get(doc.createdBy.toString()) ?? null,
    updatedAt: doc.updatedAt.toISOString(),
    activeProjects,
    financials,
    projects: projects.map((p) => ({
      id: p._id.toString(),
      projectNumber: p.projectNumber,
      name: p.name,
      status: p.status as ProjectStatus,
      progress: p.progress ?? 0,
      dueDate: isoOrNull(p.dueDate),
    })),
    quotations:
      quotations?.map((q) => ({
        id: q._id.toString(),
        quotationNumber: q.quotationNumber,
        issueDate: q.issueDate.toISOString(),
        totalPaise: q.totals?.totalPaise ?? 0,
        status: q.status as QuotationStatus,
      })) ?? null,
    invoices:
      invoices?.map((inv) => ({
        id: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber || "Draft",
        issueDate: inv.issueDate.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        totalPaise: inv.totals?.totalPaise ?? 0,
        balancePaise: inv.balancePaise ?? 0,
        status: effectiveInvoiceStatus(
          { status: inv.status as StoredInvoiceStatus, dueDate: inv.dueDate, balancePaise: inv.balancePaise ?? 0 },
          now,
        ),
      })) ?? null,
    payments:
      payments?.map((p) => ({
        id: p._id.toString(),
        paymentNumber: p.paymentNumber,
        paidAt: p.paidAt.toISOString(),
        amountPaise: p.amountPaise,
        method: p.method as PaymentMethod,
        status: p.status as PaymentStatus,
        invoiceId: p.invoice?.toString() ?? null,
      })) ?? null,
    tasks:
      tasks?.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        dueAt: t.dueAt.toISOString(),
        status: t.status as TaskStatus,
        priority: t.priority as Priority,
        assigneeName: t.assignedTo ? (users.get(t.assignedTo.toString()) ?? null) : null,
      })) ?? null,
  };
}

async function assertServicesExist(ids: string[]) {
  if (ids.length === 0) return;
  const found = await ServiceModel.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) {
    throw new BadRequestError("One of the selected services does not exist.", {
      servicesPurchased: ["Choose services from the list"],
    });
  }
}

function customerFields(data: CustomerFormData) {
  return {
    name: data.name,
    businessName: data.businessName,
    phone: data.phone,
    whatsapp: data.whatsapp,
    email: data.email,
    address: data.address,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    gstin: data.gstin,
    type: data.type,
    status: data.status,
    servicesPurchased: data.servicesPurchased.map((id) => new Types.ObjectId(id)),
    notes: data.notes,
  };
}

async function findCustomer(id: string) {
  const customer = await CustomerModel.findById(toObjectId(id, "Customer"));
  if (!customer) throw new NotFoundError("Customer");
  return customer;
}

export async function createCustomer(user: SessionUser, data: CustomerFormData) {
  await connectToDatabase();
  await assertServicesExist(data.servicesPurchased);
  const customer = await CustomerModel.create({
    ...customerFields(data),
    customerNumber: await nextSimpleNumber("customer"),
    createdBy: user.id,
  });
  await logActivity({
    actor: user,
    action: "customer.created",
    entityType: "customer",
    entityId: customer._id,
    entityLabel: customer.businessName || customer.name,
    message: `Created customer ${customer.customerNumber} for ${customer.businessName || customer.name}`,
  });
  return { id: customer._id.toString(), customerNumber: customer.customerNumber };
}

export async function updateCustomer(user: SessionUser, id: string, data: CustomerFormData) {
  await connectToDatabase();
  const customer = await findCustomer(id);
  await assertServicesExist(data.servicesPurchased);
  const previousStatus = customer.status as CustomerStatus;
  customer.set(customerFields(data));
  await customer.save();
  await logActivity({
    actor: user,
    action: "customer.updated",
    entityType: "customer",
    entityId: customer._id,
    entityLabel: customer.businessName || customer.name,
    message:
      previousStatus !== data.status
        ? `Updated customer and changed status from ${CUSTOMER_STATUS_LABELS[previousStatus]} to ${CUSTOMER_STATUS_LABELS[data.status]}`
        : "Updated customer details",
  });
  return { id: customer._id.toString() };
}

/** Archiving only hides the customer from lists and pickers; every related record is kept. */
export async function setCustomerArchived(user: SessionUser, id: string, archived: boolean) {
  await connectToDatabase();
  const customer = await findCustomer(id);
  customer.archivedAt = archived ? new Date() : undefined;
  await customer.save();
  await logActivity({
    actor: user,
    action: archived ? "customer.archived" : "customer.restored",
    entityType: "customer",
    entityId: customer._id,
    entityLabel: customer.businessName || customer.name,
    message: archived ? `Archived customer ${customer.customerNumber}` : `Restored customer ${customer.customerNumber}`,
  });
  return { id: customer._id.toString(), archived };
}

export async function addCustomerCommunication(
  user: SessionUser,
  id: string,
  input: { type: CommunicationType; summary: string; occurredAt: Date; nextFollowUpAt?: Date | null },
) {
  await connectToDatabase();
  const customer = await findCustomer(id);
  // Follow-up dates are a lead concept; customers ignore them.
  customer.communications.push({
    type: input.type,
    summary: input.summary,
    occurredAt: input.occurredAt,
    createdBy: new Types.ObjectId(user.id),
  });
  await customer.save();
  await logActivity({
    actor: user,
    action: "customer.communication_added",
    entityType: "customer",
    entityId: customer._id,
    entityLabel: customer.businessName || customer.name,
    message: `Logged a ${input.type.replace("_", " ")} with ${customer.name}`,
  });
  return { ok: true };
}

/** Search for quotation, invoice, project and task pickers. Archived customers are excluded. */
export async function customerOptions(q: string): Promise<Option[]> {
  await connectToDatabase();
  const docs = await CustomerModel.find(andFilters({ archivedAt: null }, searchClause(q.trim().slice(0, 60))))
    .select("customerNumber name businessName city")
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();
  return docs.map((d) => ({
    value: d._id.toString(),
    label: d.businessName || d.name,
    description: [d.customerNumber, d.name, d.city].filter(Boolean).join(" · "),
  }));
}

/** Customer details to freeze onto a quotation or invoice. */
export async function getCustomerBillingSnapshot(customerId: string): Promise<CustomerBillingSnapshot> {
  await connectToDatabase();
  const d = await CustomerModel.findById(toObjectId(customerId, "Customer"))
    .select("name businessName email phone address pincode city state gstin")
    .lean();
  if (!d) throw new NotFoundError("Customer");
  return {
    name: d.name,
    businessName: d.businessName ?? "",
    email: d.email ?? "",
    phone: d.phone ?? "",
    address: [d.address, d.pincode].filter(Boolean).join(" – "),
    city: d.city ?? "",
    state: d.state ?? "",
    stateCode: stateCodeOf(d.state) ?? "",
    gstin: d.gstin ?? "",
  };
}
