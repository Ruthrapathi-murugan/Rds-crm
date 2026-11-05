import "server-only";
import { Types } from "mongoose";
import {
  ACTIVE_PROJECT_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  OPEN_TASK_STATUSES,
  PAYMENT_METHODS,
  PROJECT_STATUSES,
  SERVICE_CATEGORIES,
  type LeadSource,
  type LeadStatus,
  type PaymentMethod,
  type ProjectStatus,
  type ServiceCategory,
  type StoredInvoiceStatus,
} from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { connectToDatabase } from "@/lib/mongodb";
import {
  APP_TIME_ZONE,
  endOfDayIST,
  formatMonth,
  monthKey,
  startOfDayIST,
  startOfMonthIST,
  startOfMonthsAgoIST,
} from "@/lib/utils/date";
import { ActivityLogModel } from "@/models/activity-log";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { LeadModel } from "@/models/lead";
import { PaymentModel } from "@/models/payment";
import { ProjectModel } from "@/models/project";
import { QuotationModel } from "@/models/quotation";
import { TaskModel } from "@/models/task";
import type { SessionUser } from "@/types";
import { toActivityEntry, type ActivityEntry } from "./activity.service";
import { andFilters, ownershipFilter } from "./scope";

/**
 * Financial definitions used everywhere (dashboard, reports, CSV):
 * - Invoiced: total of issued invoices (sent, partially paid, paid) by invoice date. Drafts and cancelled excluded.
 * - Received / revenue: recorded (not voided) payments by payment date — cash basis.
 * - Outstanding: balance of issued, unpaid invoices (sent, partially paid).
 * - Overdue: outstanding invoices whose due date is before today (IST).
 * - Revenue by service: taxable value of issued invoice lines by invoice date, grouped by the line's service category.
 * All month buckets use the Asia/Kolkata calendar.
 */
export const FINANCIAL_DEFINITIONS = [
  { term: "Invoiced", meaning: "Total of issued invoices (sent, partially paid or paid) by invoice date. Drafts and cancelled invoices are excluded." },
  { term: "Revenue / received", meaning: "Recorded payments by payment date (cash basis). Voided payments are excluded." },
  { term: "Outstanding", meaning: "Balance still due on issued invoices that are not fully paid." },
  { term: "Overdue", meaning: "Outstanding invoices whose due date has passed (India time)." },
  { term: "Revenue by service", meaning: "Taxable value (before GST) of issued invoice lines, grouped by the service's category." },
] as const;

const ISSUED: StoredInvoiceStatus[] = ["sent", "partially_paid", "paid"];
const RECEIVABLE: StoredInvoiceStatus[] = ["sent", "partially_paid"];

export type DateRange = { from: Date; to: Date };

/** Month keys (yyyy-MM, IST) covering a range, oldest first. */
export function monthsBetween(range: DateRange): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  let cursor = startOfMonthIST(range.from);
  const last = monthKey(range.to);
  for (let i = 0; i < 120; i++) {
    const key = monthKey(cursor);
    months.push({ key, label: formatMonth(cursor) });
    if (key === last) break;
    cursor = new Date(cursor.getTime() + 32 * 86_400_000);
    cursor = startOfMonthIST(cursor);
  }
  return months;
}

export function lastTwelveMonths(now = new Date()): DateRange {
  return { from: startOfMonthsAgoIST(now, 11), to: endOfDayIST(now) };
}

const monthExpr = (field: string) => ({ $dateToString: { format: "%Y-%m", date: `$${field}`, timezone: APP_TIME_ZONE } });

// ── Money ────────────────────────────────────────────────────────────────

export async function monthlyRevenue(range: DateRange) {
  await connectToDatabase();
  const [received, invoiced] = await Promise.all([
    PaymentModel.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { status: "recorded", paidAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: monthExpr("paidAt"), total: { $sum: "$amountPaise" }, count: { $sum: 1 } } },
    ]),
    InvoiceModel.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { status: { $in: ISSUED }, issueDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: monthExpr("issueDate"), total: { $sum: "$totals.totalPaise" }, count: { $sum: 1 } } },
    ]),
  ]);
  const r = new Map(received.map((x) => [x._id, x]));
  const inv = new Map(invoiced.map((x) => [x._id, x]));
  return monthsBetween(range).map((m) => ({
    month: m.key,
    label: m.label,
    receivedPaise: r.get(m.key)?.total ?? 0,
    payments: r.get(m.key)?.count ?? 0,
    invoicedPaise: inv.get(m.key)?.total ?? 0,
    invoices: inv.get(m.key)?.count ?? 0,
  }));
}

export async function financialTotals(range?: DateRange) {
  await connectToDatabase();
  const today = startOfDayIST(new Date());
  const [inv] = await InvoiceModel.aggregate<{ invoiced: number; outstanding: number; overdue: number; overdueCount: number }>([
    { $match: { status: { $in: ISSUED }, ...(range ? { issueDate: { $gte: range.from, $lte: range.to } } : {}) } },
    {
      $group: {
        _id: null,
        invoiced: { $sum: "$totals.totalPaise" },
        outstanding: { $sum: { $cond: [{ $in: ["$status", RECEIVABLE] }, "$balancePaise", 0] } },
        overdue: {
          $sum: { $cond: [{ $and: [{ $in: ["$status", RECEIVABLE] }, { $lt: ["$dueDate", today] }, { $gt: ["$balancePaise", 0] }] }, "$balancePaise", 0] },
        },
        overdueCount: {
          $sum: { $cond: [{ $and: [{ $in: ["$status", RECEIVABLE] }, { $lt: ["$dueDate", today] }, { $gt: ["$balancePaise", 0] }] }, 1, 0] },
        },
      },
    },
  ]);
  const [pay] = await PaymentModel.aggregate<{ received: number; count: number }>([
    { $match: { status: "recorded", ...(range ? { paidAt: { $gte: range.from, $lte: range.to } } : {}) } },
    { $group: { _id: null, received: { $sum: "$amountPaise" }, count: { $sum: 1 } } },
  ]);
  return {
    invoicedPaise: inv?.invoiced ?? 0,
    outstandingPaise: inv?.outstanding ?? 0,
    overduePaise: inv?.overdue ?? 0,
    overdueCount: inv?.overdueCount ?? 0,
    receivedPaise: pay?.received ?? 0,
    paymentCount: pay?.count ?? 0,
  };
}

/** Outstanding balances bucketed by days past the due date (all time, as of today). */
export async function receivablesAging(now = new Date()) {
  await connectToDatabase();
  const today = startOfDayIST(now);
  const invoices = await InvoiceModel.find({ status: { $in: RECEIVABLE }, balancePaise: { $gt: 0 } })
    .select("invoiceNumber billTo customer dueDate issueDate totals balancePaise")
    .sort({ dueDate: 1 })
    .lean();
  const buckets = [
    { key: "current", label: "Not yet due", min: -Infinity, max: 0 },
    { key: "1-30", label: "1–30 days overdue", min: 1, max: 30 },
    { key: "31-60", label: "31–60 days overdue", min: 31, max: 60 },
    { key: "61-90", label: "61–90 days overdue", min: 61, max: 90 },
    { key: "90+", label: "Over 90 days overdue", min: 91, max: Infinity },
  ].map((b) => ({ ...b, totalPaise: 0, count: 0 }));
  const rows = invoices.map((i) => {
    const daysOverdue = Math.floor((today.getTime() - startOfDayIST(i.dueDate).getTime()) / 86_400_000);
    const bucket = buckets.find((b) => daysOverdue >= b.min && daysOverdue <= b.max) ?? buckets[0];
    bucket.totalPaise += i.balancePaise ?? 0;
    bucket.count += 1;
    return {
      id: i._id.toString(),
      invoiceNumber: i.invoiceNumber ?? "",
      customerId: i.customer.toString(),
      customerName: i.billTo?.businessName || i.billTo?.name || "",
      issueDate: i.issueDate.toISOString(),
      dueDate: i.dueDate.toISOString(),
      totalPaise: i.totals?.totalPaise ?? 0,
      balancePaise: i.balancePaise ?? 0,
      daysOverdue: Math.max(0, daysOverdue),
      bucket: bucket.label,
    };
  });
  return { buckets: buckets.map(({ key, label, totalPaise, count }) => ({ key, label, totalPaise, count })), rows };
}

export async function paymentsByMethod(range: DateRange) {
  await connectToDatabase();
  const rows = await PaymentModel.aggregate<{ _id: PaymentMethod; total: number; count: number }>([
    { $match: { status: "recorded", paidAt: { $gte: range.from, $lte: range.to } } },
    { $group: { _id: "$method", total: { $sum: "$amountPaise" }, count: { $sum: 1 } } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r]));
  return PAYMENT_METHODS.map((method) => ({ method, totalPaise: map.get(method)?.total ?? 0, count: map.get(method)?.count ?? 0 }));
}

export async function paymentsInRange(range: DateRange) {
  await connectToDatabase();
  const rows = await PaymentModel.find({ status: "recorded", paidAt: { $gte: range.from, $lte: range.to } })
    .sort({ paidAt: 1 })
    .lean();
  const customerIds = [...new Set(rows.map((r) => r.customer.toString()))];
  const invoiceIds = [...new Set(rows.map((r) => r.invoice?.toString()).filter(Boolean))];
  const [customers, invoices] = await Promise.all([
    CustomerModel.find({ _id: { $in: customerIds } }).select("name businessName").lean(),
    InvoiceModel.find({ _id: { $in: invoiceIds } }).select("invoiceNumber").lean(),
  ]);
  const cName = new Map(customers.map((c) => [c._id.toString(), c.businessName || c.name]));
  const iNum = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber ?? ""]));
  return rows.map((r) => ({
    paymentNumber: r.paymentNumber,
    paidAt: r.paidAt.toISOString(),
    customer: cName.get(r.customer.toString()) ?? "",
    invoice: r.invoice ? (iNum.get(r.invoice.toString()) ?? "") : "",
    method: r.method as PaymentMethod,
    reference: r.transactionReference ?? "",
    amountPaise: r.amountPaise,
  }));
}

/** Taxable value of issued invoice lines by service category. */
export async function revenueByServiceCategory(range: DateRange) {
  await connectToDatabase();
  const rows = await InvoiceModel.aggregate<{ _id: ServiceCategory | null; taxable: number; lines: number }>([
    { $match: { status: { $in: ISSUED }, issueDate: { $gte: range.from, $lte: range.to } } },
    { $unwind: "$items" },
    { $lookup: { from: "services", localField: "items.service", foreignField: "_id", as: "service" } },
    { $group: { _id: { $ifNull: [{ $first: "$service.category" }, null] }, taxable: { $sum: "$items.taxablePaise" }, lines: { $sum: 1 } } },
  ]);
  const map = new Map(rows.map((r) => [r._id ?? "uncategorised", r]));
  return [
    ...SERVICE_CATEGORIES.map((category) => ({ category, taxablePaise: map.get(category)?.taxable ?? 0, lines: map.get(category)?.lines ?? 0 })),
    { category: "uncategorised" as const, taxablePaise: map.get("uncategorised")?.taxable ?? 0, lines: map.get("uncategorised")?.lines ?? 0 },
  ];
}

// ── Sales ────────────────────────────────────────────────────────────────

/** Leads created in the range, by source, with how many were won (converted). */
export async function leadSourcesReport(user: SessionUser, range: DateRange) {
  await connectToDatabase();
  const rows = await LeadModel.aggregate<{ _id: LeadSource; total: number; won: number; lost: number; value: number }>([
    { $match: andFilters({ createdAt: { $gte: range.from, $lte: range.to } }, ownershipFilter(user)) },
    {
      $group: {
        _id: "$source",
        total: { $sum: 1 },
        won: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
        lost: { $sum: { $cond: [{ $eq: ["$status", "lost"] }, 1, 0] } },
        value: { $sum: { $cond: [{ $eq: ["$status", "won"] }, "$estimatedValuePaise", 0] } },
      },
    },
  ]);
  const map = new Map(rows.map((r) => [r._id, r]));
  return LEAD_SOURCES.map((source) => {
    const r = map.get(source);
    const total = r?.total ?? 0;
    const won = r?.won ?? 0;
    return { source, total, won, lost: r?.lost ?? 0, wonValuePaise: r?.value ?? 0, conversionRate: total ? (won / total) * 100 : 0 };
  });
}

export async function leadStatusFunnel(user: SessionUser, range?: DateRange) {
  await connectToDatabase();
  const rows = await LeadModel.aggregate<{ _id: LeadStatus; count: number }>([
    { $match: andFilters({ archivedAt: null }, range ? { createdAt: { $gte: range.from, $lte: range.to } } : {}, ownershipFilter(user)) },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r.count]));
  const statuses = LEAD_STATUSES.map((status) => ({ status, count: map.get(status) ?? 0 }));
  const total = statuses.reduce((t, s) => t + s.count, 0);
  const won = map.get("won") ?? 0;
  const lost = map.get("lost") ?? 0;
  return { statuses, total, won, lost, conversionRate: total ? (won / total) * 100 : 0, closedRate: won + lost ? (won / (won + lost)) * 100 : 0 };
}

// ── Delivery ─────────────────────────────────────────────────────────────

export async function projectStatusReport(user: SessionUser, range?: DateRange) {
  await connectToDatabase();
  const today = startOfDayIST(new Date());
  const scope = ownershipFilter(user);
  const [byStatus, overdue, completedInRange] = await Promise.all([
    ProjectModel.aggregate<{ _id: ProjectStatus; count: number; quoted: number }>([
      { $match: andFilters({ archivedAt: null }, scope) },
      { $group: { _id: "$status", count: { $sum: 1 }, quoted: { $sum: "$quotedAmountPaise" } } },
    ]),
    ProjectModel.find(andFilters({ archivedAt: null, status: { $in: ACTIVE_PROJECT_STATUSES }, dueDate: { $lt: today } }, scope))
      .select("projectNumber name dueDate status customer progress")
      .sort({ dueDate: 1 })
      .limit(50)
      .lean(),
    range
      ? ProjectModel.countDocuments(andFilters({ status: "completed", completedAt: { $gte: range.from, $lte: range.to } }, scope))
      : Promise.resolve(0),
  ]);
  const map = new Map(byStatus.map((r) => [r._id, r]));
  const customers = await CustomerModel.find({ _id: { $in: overdue.map((p) => p.customer) } }).select("name businessName").lean();
  const cName = new Map(customers.map((c) => [c._id.toString(), c.businessName || c.name]));
  return {
    statuses: PROJECT_STATUSES.map((status) => ({ status, count: map.get(status)?.count ?? 0, quotedPaise: map.get(status)?.quoted ?? 0 })),
    completedInRange,
    overdue: overdue.map((p) => ({
      id: p._id.toString(),
      projectNumber: p.projectNumber,
      name: p.name,
      customer: cName.get(p.customer.toString()) ?? "",
      dueDate: p.dueDate?.toISOString() ?? "",
      progress: p.progress ?? 0,
      status: p.status as ProjectStatus,
    })),
  };
}

/** Customers ranked by money received in the range, with invoiced and outstanding. */
export async function customerActivityReport(range: DateRange, limit = 25) {
  await connectToDatabase();
  const [paid, invoiced, outstanding, newCustomers] = await Promise.all([
    PaymentModel.aggregate<{ _id: Types.ObjectId; total: number; last: Date }>([
      { $match: { status: "recorded", paidAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: "$customer", total: { $sum: "$amountPaise" }, last: { $max: "$paidAt" } } },
    ]),
    InvoiceModel.aggregate<{ _id: Types.ObjectId; total: number; count: number }>([
      { $match: { status: { $in: ISSUED }, issueDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: "$customer", total: { $sum: "$totals.totalPaise" }, count: { $sum: 1 } } },
    ]),
    InvoiceModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { status: { $in: RECEIVABLE } } },
      { $group: { _id: "$customer", total: { $sum: "$balancePaise" } } },
    ]),
    CustomerModel.countDocuments({ createdAt: { $gte: range.from, $lte: range.to } }),
  ]);
  const ids = new Set([...paid, ...invoiced].map((r) => r._id.toString()));
  const customers = await CustomerModel.find({ _id: { $in: [...ids] } }).select("customerNumber name businessName city").lean();
  const p = new Map(paid.map((r) => [r._id.toString(), r]));
  const inv = new Map(invoiced.map((r) => [r._id.toString(), r]));
  const out = new Map(outstanding.map((r) => [r._id.toString(), r.total]));
  const rows = customers
    .map((c) => {
      const id = c._id.toString();
      return {
        id,
        customerNumber: c.customerNumber,
        name: c.businessName || c.name,
        city: c.city ?? "",
        receivedPaise: p.get(id)?.total ?? 0,
        invoicedPaise: inv.get(id)?.total ?? 0,
        invoices: inv.get(id)?.count ?? 0,
        outstandingPaise: out.get(id) ?? 0,
        lastPaymentAt: p.get(id)?.last?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.receivedPaise - a.receivedPaise || b.invoicedPaise - a.invoicedPaise)
    .slice(0, limit);
  return { rows, newCustomers };
}

// ── Dashboard ────────────────────────────────────────────────────────────

export async function dashboardData(user: SessionUser, now = new Date()) {
  await connectToDatabase();
  const scope = ownershipFilter(user);
  const monthStart = startOfMonthIST(now);
  const today = startOfDayIST(now);
  const weekAhead = new Date(endOfDayIST(now).getTime() + 7 * 86_400_000);
  const canFinance = hasPermission(user, "invoices:read");
  const canPayments = hasPermission(user, "payments:read");
  const canQuotations = hasPermission(user, "quotations:read");
  const canCustomers = hasPermission(user, "customers:read");
  const canProjects = hasPermission(user, "projects:read");
  const userId = new Types.ObjectId(user.id);

  const [
    totalLeads,
    newLeadsThisMonth,
    totalCustomers,
    activeProjects,
    completedProjects,
    pendingQuotations,
    finance,
    funnel,
    revenue,
    recentLeads,
    upcomingTasks,
    followUps,
    overdueInvoices,
    projectActivity,
  ] = await Promise.all([
    LeadModel.countDocuments(andFilters({ archivedAt: null }, scope)),
    LeadModel.countDocuments(andFilters({ archivedAt: null, createdAt: { $gte: monthStart } }, scope)),
    canCustomers ? CustomerModel.countDocuments({ archivedAt: null }) : Promise.resolve(0),
    canProjects ? ProjectModel.countDocuments(andFilters({ archivedAt: null, status: { $in: ACTIVE_PROJECT_STATUSES } }, scope)) : Promise.resolve(0),
    canProjects ? ProjectModel.countDocuments(andFilters({ archivedAt: null, status: "completed" }, scope)) : Promise.resolve(0),
    canQuotations ? QuotationModel.countDocuments({ status: { $in: ["draft", "sent"] }, validUntil: { $gte: today } }) : Promise.resolve(0),
    canFinance || canPayments ? financialTotals() : Promise.resolve(null),
    leadStatusFunnel(user),
    canPayments ? monthlyRevenue(lastTwelveMonths(now)) : Promise.resolve([]),
    LeadModel.find(andFilters({ archivedAt: null }, scope)).sort({ createdAt: -1 }).limit(6).select("leadNumber contactName businessName source status createdAt estimatedValuePaise").lean(),
    TaskModel.find({ assignedTo: userId, status: { $in: OPEN_TASK_STATUSES }, dueAt: { $lte: weekAhead } })
      .sort({ dueAt: 1 })
      .limit(8)
      .select("title dueAt priority status lead customer project")
      .lean(),
    LeadModel.find(andFilters({ archivedAt: null, status: { $nin: ["won", "lost"] }, nextFollowUpAt: { $ne: null, $lte: weekAhead } }, scope))
      .sort({ nextFollowUpAt: 1 })
      .limit(6)
      .select("contactName businessName nextFollowUpAt status")
      .lean(),
    canFinance
      ? InvoiceModel.find({ status: { $in: RECEIVABLE }, balancePaise: { $gt: 0 }, dueDate: { $lt: today } })
          .sort({ dueDate: 1 })
          .limit(6)
          .select("invoiceNumber billTo dueDate balancePaise")
          .lean()
      : Promise.resolve([]),
    canProjects
      ? ActivityLogModel.find({ entityType: "project", ...(hasPermission(user, "records:all") ? {} : { actor: userId }) })
          .sort({ createdAt: -1 })
          .limit(8)
          .lean()
      : Promise.resolve([]),
  ]);

  return {
    kpis: {
      totalLeads,
      newLeadsThisMonth,
      totalCustomers,
      activeProjects,
      completedProjects,
      pendingQuotations,
      invoicedPaise: finance?.invoicedPaise ?? 0,
      receivedPaise: finance?.receivedPaise ?? 0,
      outstandingPaise: finance?.outstandingPaise ?? 0,
      overduePaise: finance?.overduePaise ?? 0,
      overdueCount: finance?.overdueCount ?? 0,
    },
    access: { finance: canFinance, payments: canPayments, quotations: canQuotations, customers: canCustomers, projects: canProjects },
    funnel,
    revenue,
    recentLeads: recentLeads.map((l) => ({
      id: l._id.toString(),
      leadNumber: l.leadNumber,
      name: l.contactName,
      business: l.businessName ?? "",
      source: l.source as LeadSource,
      status: l.status as LeadStatus,
      createdAt: l.createdAt.toISOString(),
      valuePaise: l.estimatedValuePaise ?? 0,
    })),
    upcomingTasks: upcomingTasks.map((t) => ({
      id: t._id.toString(),
      title: t.title,
      dueAt: t.dueAt.toISOString(),
      priority: t.priority,
      overdue: t.dueAt.getTime() < now.getTime(),
      href: t.project ? `/projects/${t.project}` : t.lead ? `/leads/${t.lead}` : t.customer ? `/customers/${t.customer}` : "/tasks",
    })),
    followUps: followUps.map((l) => ({
      id: l._id.toString(),
      name: l.contactName,
      business: l.businessName ?? "",
      at: l.nextFollowUpAt!.toISOString(),
      overdue: l.nextFollowUpAt!.getTime() < now.getTime(),
    })),
    overdueInvoices: overdueInvoices.map((i) => ({
      id: i._id.toString(),
      invoiceNumber: i.invoiceNumber ?? "",
      customer: i.billTo?.businessName || i.billTo?.name || "",
      dueDate: i.dueDate.toISOString(),
      balancePaise: i.balancePaise ?? 0,
      daysOverdue: Math.floor((today.getTime() - startOfDayIST(i.dueDate).getTime()) / 86_400_000),
    })),
    projectActivity: projectActivity.map((a) => toActivityEntry(a) as ActivityEntry),
  };
}
