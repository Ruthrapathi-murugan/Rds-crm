import "server-only";
import { hasPermission } from "@/lib/permissions";
import { Types } from "mongoose";
import {
  ACTIVE_PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type Priority,
  type ProjectStatus,
  type ServiceCategory,
} from "@/lib/constants";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { escapeRegex, paginated, skipFor } from "@/lib/list-params";
import { connectToDatabase } from "@/lib/mongodb";
import { startOfDayIST } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import type { ProjectFormData } from "@/lib/validations/project";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { ProjectModel, type ProjectDoc } from "@/models/project";
import { ServiceModel } from "@/models/service";
import type { ListParams, Option, Paginated, SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import { assertAssignableUser, idOrNull, isoOrNull, serviceNames, userNames } from "./lookup.service";
import { notify } from "./notification.service";
import { nextSimpleNumber } from "./numbering.service";
import { andFilters, ownershipFilter, toObjectId } from "./scope";

export const PROJECT_SORTS = ["createdAt", "name", "dueDate", "quotedAmountPaise", "progress", "status"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export type ActiveProjectStatus = (typeof ACTIVE_PROJECT_STATUSES)[number];

/** Invoice statuses that count as "invoiced" in a project's financial summary. */
export const INVOICED_STATUSES = ["sent", "partially_paid", "paid"] as const;

export type ProjectFilters = {
  status?: ProjectStatus;
  category?: ServiceCategory;
  priority?: Priority;
  assignedTo?: string; // user id, "me" or "unassigned"
  customer?: string;
  overdue?: boolean;
  archived?: boolean;
};

export type ProjectRow = {
  id: string;
  projectNumber: string;
  name: string;
  customerId: string;
  customerName: string;
  category: ServiceCategory;
  status: ProjectStatus;
  priority: Priority;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  quotedAmountPaise: number;
  assignedToId: string | null;
  assignedToName: string | null;
  checklistDone: number;
  checklistTotal: number;
  overdue: boolean;
  archived: boolean;
  completedAt: string | null;
  createdAt: string;
};

export type ChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  doneByName: string | null;
};

export type ProjectFinancials = {
  quotedPaise: number;
  advanceAgreedPaise: number;
  invoicedPaise: number;
  receivedPaise: number;
  remainingPaise: number;
};

export type ProjectDetail = ProjectRow & {
  customerNumber: string | null;
  serviceId: string | null;
  serviceName: string | null;
  description: string;
  internalNotes: string;
  advanceAmountPaise: number;
  checklist: ChecklistItem[];
  /** Null when the user may not see invoices and payments. */
  financials: ProjectFinancials | null;
  sourceLeadId: string | null;
  createdByName: string | null;
  updatedAt: string;
};

const isActive = (status: string) => (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(status);

/** Due date before the start of today (IST) while the project is still active. */
export function isProjectOverdue(p: { dueDate?: Date | null; status: string }, now: Date) {
  return Boolean(p.dueDate && isActive(p.status) && p.dueDate.getTime() < startOfDayIST(now).getTime());
}

function baseFilter(user: SessionUser, filters: ProjectFilters, now: Date) {
  const filter: Record<string, unknown> = { archivedAt: filters.archived ? { $ne: null } : null };
  if (filters.status) filter.status = filters.status;
  if (filters.category) filter.category = filters.category;
  if (filters.priority) filter.priority = filters.priority;
  if (filters.assignedTo === "unassigned") filter.assignedTo = null;
  else if (filters.assignedTo === "me") filter.assignedTo = new Types.ObjectId(user.id);
  else if (filters.assignedTo && Types.ObjectId.isValid(filters.assignedTo)) {
    filter.assignedTo = new Types.ObjectId(filters.assignedTo);
  }
  if (filters.customer && Types.ObjectId.isValid(filters.customer)) filter.customer = new Types.ObjectId(filters.customer);
  if (filters.overdue) {
    filter.dueDate = { $lt: startOfDayIST(now) };
    filter.status = filters.status
      ? isActive(filters.status)
        ? filters.status
        : { $in: [] }
      : { $in: [...ACTIVE_PROJECT_STATUSES] };
  }
  return andFilters(filter, ownershipFilter(user));
}

function searchClause(q: string) {
  if (!q) return {};
  const re = new RegExp(escapeRegex(q), "i");
  return { $or: [{ name: re }, { projectNumber: re }] };
}

type CustomerRef = { name: string; number: string };

async function customerRefs(ids: (Types.ObjectId | string | null | undefined)[]): Promise<Map<string, CustomerRef>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const docs = await CustomerModel.find({ _id: { $in: unique } }).select("name businessName customerNumber").lean();
  return new Map(
    docs.map((c) => [c._id.toString(), { name: c.businessName ? `${c.name} (${c.businessName})` : c.name, number: c.customerNumber }]),
  );
}

function toRow(d: ProjectDoc, users: Map<string, string>, customers: Map<string, CustomerRef>, now: Date): ProjectRow {
  const checklist = d.checklist ?? [];
  return {
    id: d._id.toString(),
    projectNumber: d.projectNumber,
    name: d.name,
    customerId: d.customer.toString(),
    customerName: customers.get(d.customer.toString())?.name ?? "Unknown customer",
    category: d.category as ServiceCategory,
    status: d.status as ProjectStatus,
    priority: d.priority as Priority,
    progress: d.progress ?? 0,
    startDate: isoOrNull(d.startDate),
    dueDate: isoOrNull(d.dueDate),
    quotedAmountPaise: d.quotedAmountPaise ?? 0,
    assignedToId: idOrNull(d.assignedTo),
    assignedToName: d.assignedTo ? (users.get(d.assignedTo.toString()) ?? null) : null,
    checklistDone: checklist.filter((i) => i.done).length,
    checklistTotal: checklist.length,
    overdue: isProjectOverdue(d, now),
    archived: Boolean(d.archivedAt),
    completedAt: isoOrNull(d.completedAt),
    createdAt: d.createdAt.toISOString(),
  };
}

async function toRows(docs: ProjectDoc[], now: Date): Promise<ProjectRow[]> {
  const [users, customers] = await Promise.all([
    userNames(docs.map((d) => d.assignedTo)),
    customerRefs(docs.map((d) => d.customer)),
  ]);
  return docs.map((d) => toRow(d, users, customers, now));
}

export async function listProjects(
  user: SessionUser,
  params: ListParams<ProjectSort>,
  filters: ProjectFilters = {},
): Promise<Paginated<ProjectRow>> {
  await connectToDatabase();
  const now = new Date();
  const filter = andFilters(baseFilter(user, filters, now), searchClause(params.q));
  const sort: Record<string, 1 | -1> = { [params.sort]: params.dir === "asc" ? 1 : -1, _id: -1 };
  const [docs, total] = await Promise.all([
    ProjectModel.find(filter).sort(sort).skip(skipFor(params)).limit(params.pageSize).lean(),
    ProjectModel.countDocuments(filter),
  ]);
  return paginated(await toRows(docs as ProjectDoc[], now), total, params);
}

/** Active projects grouped by status for the board view. Undated projects sort last. */
export async function projectBoard(
  user: SessionUser,
  q: string,
  filters: Omit<ProjectFilters, "status" | "archived"> = {},
  perColumn = 100,
): Promise<Record<ActiveProjectStatus, ProjectRow[]>> {
  await connectToDatabase();
  const now = new Date();
  const board = Object.fromEntries(ACTIVE_PROJECT_STATUSES.map((s) => [s, [] as ProjectRow[]])) as Record<
    ActiveProjectStatus,
    ProjectRow[]
  >;
  const columns = await Promise.all(
    ACTIVE_PROJECT_STATUSES.map((status) =>
      ProjectModel.find(andFilters(baseFilter(user, { ...filters, status }, now), searchClause(q)))
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(perColumn)
        .lean(),
    ),
  );
  const rows = await toRows(columns.flat() as ProjectDoc[], now);
  for (const row of rows) board[row.status as ActiveProjectStatus]?.push(row);
  for (const status of ACTIVE_PROJECT_STATUSES) {
    board[status].sort((a, b) => {
      if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    });
  }
  return board;
}

/** Counts per status for the pills strip (respects record visibility). */
export async function projectStatusCounts(user: SessionUser): Promise<Record<ProjectStatus, number>> {
  await connectToDatabase();
  const rows = await ProjectModel.aggregate<{ _id: ProjectStatus; count: number }>([
    { $match: andFilters({ archivedAt: null }, ownershipFilter(user)) },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, 0])) as Record<ProjectStatus, number>;
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

async function findVisibleProject(user: SessionUser, id: string) {
  const project = await ProjectModel.findOne(andFilters({ _id: toObjectId(id, "Project") }, ownershipFilter(user)));
  if (!project) throw new NotFoundError("Project");
  return project;
}

function assertEditable(project: { archivedAt?: Date | null }) {
  if (project.archivedAt) throw new ConflictError("Restore this project before changing it.");
}

/** Money summary. Received comes from recorded payments, never from the advance field. */
export async function projectFinancials(
  projectId: Types.ObjectId,
  quotedPaise: number,
  advanceAgreedPaise: number,
): Promise<ProjectFinancials> {
  const [invoiced, received] = await Promise.all([
    InvoiceModel.aggregate<{ total: number }>([
      { $match: { project: projectId, status: { $in: [...INVOICED_STATUSES] } } },
      { $group: { _id: null, total: { $sum: "$totals.totalPaise" } } },
    ]),
    PaymentModel.aggregate<{ total: number }>([
      { $match: { project: projectId, status: "recorded" } },
      { $group: { _id: null, total: { $sum: "$amountPaise" } } },
    ]),
  ]);
  const receivedPaise = received[0]?.total ?? 0;
  return {
    quotedPaise,
    advanceAgreedPaise,
    invoicedPaise: invoiced[0]?.total ?? 0,
    receivedPaise,
    remainingPaise: Math.max(0, quotedPaise - receivedPaise),
  };
}

function toChecklist(doc: ProjectDoc, users: Map<string, string>): ChecklistItem[] {
  return (doc.checklist ?? []).map((item) => {
    const i = item as typeof item & { _id: Types.ObjectId };
    return {
      id: i._id.toString(),
      title: i.title,
      done: Boolean(i.done),
      doneAt: isoOrNull(i.doneAt),
      doneByName: i.doneBy ? (users.get(i.doneBy.toString()) ?? null) : null,
    };
  });
}

export async function getProject(user: SessionUser, id: string): Promise<ProjectDetail | null> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(id) || !/^[a-f0-9]{24}$/i.test(id)) return null;
  const doc = (await ProjectModel.findOne(andFilters({ _id: new Types.ObjectId(id) }, ownershipFilter(user))).lean()) as
    | ProjectDoc
    | null;
  if (!doc) return null;
  const now = new Date();
  const [users, customers, services, financials] = await Promise.all([
    userNames([doc.assignedTo, doc.createdBy, ...(doc.checklist ?? []).map((i) => i.doneBy)]),
    customerRefs([doc.customer]),
    serviceNames([doc.service]),
    hasPermission(user, "invoices:read") && hasPermission(user, "payments:read")
      ? projectFinancials(doc._id, doc.quotedAmountPaise ?? 0, doc.advanceAmountPaise ?? 0)
      : Promise.resolve(null),
  ]);
  return {
    ...toRow(doc, users, customers, now),
    customerNumber: customers.get(doc.customer.toString())?.number ?? null,
    serviceId: idOrNull(doc.service),
    serviceName: doc.service ? (services.get(doc.service.toString()) ?? null) : null,
    description: doc.description ?? "",
    internalNotes: doc.internalNotes ?? "",
    advanceAmountPaise: doc.advanceAmountPaise ?? 0,
    checklist: toChecklist(doc, users),
    financials,
    sourceLeadId: idOrNull(doc.sourceLead),
    createdByName: users.get(doc.createdBy.toString()) ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function assertCustomerUsable(customerId: string) {
  const customer = await CustomerModel.findById(customerId).select("archivedAt").lean();
  if (!customer) throw new BadRequestError("The selected customer does not exist.", { customer: ["Choose a customer from the list"] });
  if (customer.archivedAt) {
    throw new BadRequestError("The selected customer is archived.", { customer: ["Restore this customer or choose another"] });
  }
}

/** Validates the service and returns the category to store (the service's own when one is chosen). */
async function resolveCategory(data: ProjectFormData): Promise<ServiceCategory> {
  if (!data.service) return data.category;
  const service = await ServiceModel.findById(data.service).select("category").lean();
  if (!service) throw new BadRequestError("The selected service does not exist.", { service: ["Choose a service from the list"] });
  return service.category as ServiceCategory;
}

function projectFields(data: ProjectFormData, category: ServiceCategory) {
  return {
    name: data.name,
    customer: new Types.ObjectId(data.customer),
    // undefined (not null) clears optional fields on update.
    service: data.service ?? undefined,
    category,
    description: data.description,
    startDate: data.startDate ?? undefined,
    dueDate: data.dueDate ?? undefined,
    quotedAmountPaise: data.quotedAmount,
    advanceAmountPaise: data.advanceAmount,
    assignedTo: data.assignedTo ?? undefined,
    priority: data.priority,
    internalNotes: data.internalNotes,
  };
}

/** Status side effects: completing sets completedAt and 100%; leaving completed clears completedAt. */
function applyStatus(
  project: { status: string; progress?: number | null; completedAt?: Date | null },
  status: ProjectStatus,
  now = new Date(),
) {
  if (status === "completed") {
    if (project.status !== "completed" || !project.completedAt) project.completedAt = now;
    project.progress = 100;
  } else {
    project.completedAt = undefined;
  }
  project.status = status;
}

export async function createProject(user: SessionUser, data: ProjectFormData) {
  await connectToDatabase();
  const [category] = await Promise.all([
    resolveCategory(data),
    assertCustomerUsable(data.customer),
    assertAssignableUser(data.assignedTo),
  ]);
  const draft: { status: ProjectStatus; progress: number; completedAt?: Date | null } = { status: "not_started", progress: data.progress };
  applyStatus(draft, data.status);
  const project = await ProjectModel.create({
    ...projectFields(data, category),
    status: draft.status,
    progress: draft.progress,
    completedAt: draft.completedAt ?? undefined,
    projectNumber: await nextSimpleNumber("project"),
    createdBy: user.id,
  });
  await logActivity({
    actor: user,
    action: "project.created",
    entityType: "project",
    entityId: project._id,
    entityLabel: project.name,
    message: `Created project ${project.projectNumber}${data.quotedAmount ? ` quoted at ${formatINR(data.quotedAmount)}` : ""}`,
  });
  await notify(
    data.assignedTo,
    { type: "project.assigned", title: `Project assigned to you: ${project.name}`, message: project.projectNumber, link: `/projects/${project._id}` },
    user,
  );
  return { id: project._id.toString(), projectNumber: project.projectNumber };
}

export async function updateProject(user: SessionUser, id: string, data: ProjectFormData) {
  await connectToDatabase();
  const project = await findVisibleProject(user, id);
  assertEditable(project);
  const customerChanged = project.customer.toString() !== data.customer;
  const [category] = await Promise.all([
    resolveCategory(data),
    customerChanged ? assertCustomerUsable(data.customer) : Promise.resolve(),
    assertAssignableUser(data.assignedTo),
  ]);
  const previousAssignee = project.assignedTo?.toString() ?? null;
  const previousStatus = project.status as ProjectStatus;
  const previousProgress = project.progress ?? 0;
  const moneyChanged =
    project.quotedAmountPaise !== data.quotedAmount || project.advanceAmountPaise !== data.advanceAmount;

  project.set(projectFields(data, category));
  project.progress = data.progress;
  applyStatus(project, data.status);
  await project.save();

  const changes: string[] = [];
  if (previousStatus !== project.status) {
    changes.push(`status ${PROJECT_STATUS_LABELS[previousStatus]} → ${PROJECT_STATUS_LABELS[project.status as ProjectStatus]}`);
  }
  if (previousProgress !== project.progress) changes.push(`progress ${previousProgress}% → ${project.progress}%`);
  if (moneyChanged) changes.push(`quoted ${formatINR(data.quotedAmount)}, advance ${formatINR(data.advanceAmount)}`);
  await logActivity({
    actor: user,
    action: "project.updated",
    entityType: "project",
    entityId: project._id,
    entityLabel: project.name,
    message: changes.length ? `Updated project: ${changes.join("; ")}` : "Updated project details",
    sensitive: moneyChanged,
    meta: previousStatus !== project.status ? { from: previousStatus, to: project.status } : undefined,
  });
  if (data.assignedTo && data.assignedTo !== previousAssignee) {
    await notify(
      data.assignedTo,
      { type: "project.assigned", title: `Project assigned to you: ${project.name}`, message: project.projectNumber, link: `/projects/${project._id}` },
      user,
    );
  }
  return { id: project._id.toString() };
}

export async function changeProjectStatus(user: SessionUser, id: string, status: ProjectStatus) {
  await connectToDatabase();
  const project = await findVisibleProject(user, id);
  assertEditable(project);
  const previous = project.status as ProjectStatus;
  if (previous === status) return { id: project._id.toString(), status, progress: project.progress ?? 0 };
  applyStatus(project, status);
  await project.save();
  await logActivity({
    actor: user,
    action: "project.status_changed",
    entityType: "project",
    entityId: project._id,
    entityLabel: project.name,
    message: `Changed status from ${PROJECT_STATUS_LABELS[previous]} to ${PROJECT_STATUS_LABELS[status]}`,
    meta: { from: previous, to: status },
  });
  return { id: project._id.toString(), status, progress: project.progress ?? 0 };
}

export async function setProjectProgress(user: SessionUser, id: string, progress: number) {
  await connectToDatabase();
  const project = await findVisibleProject(user, id);
  assertEditable(project);
  if (project.status === "completed" && progress !== 100) {
    throw new ConflictError("This project is completed. Change its status before lowering progress.");
  }
  const previous = project.progress ?? 0;
  if (previous === progress) return { id: project._id.toString(), progress };
  project.progress = progress;
  await project.save();
  await logActivity({
    actor: user,
    action: "project.progress_updated",
    entityType: "project",
    entityId: project._id,
    entityLabel: project.name,
    message: `Updated progress from ${previous}% to ${progress}%`,
    meta: { from: previous, to: progress },
  });
  return { id: project._id.toString(), progress };
}

async function checklistResult(project: { toObject: () => unknown }) {
  const doc = project.toObject() as ProjectDoc;
  const users = await userNames((doc.checklist ?? []).map((i) => i.doneBy));
  return toChecklist(doc, users);
}

export async function addChecklistItem(user: SessionUser, id: string, title: string) {
  await connectToDatabase();
  const project = await findVisibleProject(user, id);
  assertEditable(project);
  if (project.checklist.length >= 200) throw new ConflictError("A checklist can have at most 200 items.");
  project.checklist.push({ title, done: false });
  await project.save();
  await logActivity({
    actor: user,
    action: "project.checklist_added",
    entityType: "project",
    entityId: project._id,
    entityLabel: project.name,
    message: `Added checklist item “${title}”`,
  });
  return checklistResult(project);
}

function findItem(project: Awaited<ReturnType<typeof findVisibleProject>>, itemId: string) {
  const item = Types.ObjectId.isValid(itemId) ? project.checklist.id(itemId) : null;
  if (!item) throw new NotFoundError("Checklist item");
  return item;
}

export async function toggleChecklistItem(user: SessionUser, id: string, itemId: string, done: boolean) {
  await connectToDatabase();
  const project = await findVisibleProject(user, id);
  assertEditable(project);
  const item = findItem(project, itemId);
  if (Boolean(item.done) !== done) {
    item.done = done;
    item.doneAt = done ? new Date() : undefined;
    item.set("doneBy", done ? new Types.ObjectId(user.id) : undefined);
    await project.save();
    await logActivity({
      actor: user,
      action: done ? "project.checklist_done" : "project.checklist_reopened",
      entityType: "project",
      entityId: project._id,
      entityLabel: project.name,
      message: done ? `Completed checklist item “${item.title}”` : `Reopened checklist item “${item.title}”`,
    });
  }
  return checklistResult(project);
}

export async function deleteChecklistItem(user: SessionUser, id: string, itemId: string) {
  await connectToDatabase();
  const project = await findVisibleProject(user, id);
  assertEditable(project);
  const item = findItem(project, itemId);
  const title = item.title;
  item.deleteOne();
  await project.save();
  await logActivity({
    actor: user,
    action: "project.checklist_removed",
    entityType: "project",
    entityId: project._id,
    entityLabel: project.name,
    message: `Removed checklist item “${title}”`,
  });
  return checklistResult(project);
}

export async function setProjectArchived(user: SessionUser, id: string, archived: boolean) {
  await connectToDatabase();
  const project = await findVisibleProject(user, id);
  project.archivedAt = archived ? new Date() : undefined;
  await project.save();
  await logActivity({
    actor: user,
    action: archived ? "project.archived" : "project.restored",
    entityType: "project",
    entityId: project._id,
    entityLabel: project.name,
    message: archived ? `Archived project ${project.projectNumber}` : `Restored project ${project.projectNumber}`,
  });
  return { id: project._id.toString(), archived };
}

/** Search for task/invoice pickers; optionally limited to one customer's projects. */
export async function projectOptions(user: SessionUser, q: string, customerId?: string | null): Promise<Option[]> {
  await connectToDatabase();
  const scope: Record<string, unknown> = { archivedAt: null };
  if (customerId && /^[a-f0-9]{24}$/i.test(customerId)) scope.customer = new Types.ObjectId(customerId);
  const docs = await ProjectModel.find(andFilters(scope, searchClause(q.trim().slice(0, 60)), ownershipFilter(user)))
    .select("projectNumber name customer")
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();
  const customers = await customerRefs(docs.map((d) => d.customer));
  return docs.map((d) => ({
    value: d._id.toString(),
    label: d.name,
    description: [d.projectNumber, customers.get(d.customer.toString())?.name].filter(Boolean).join(" · "),
  }));
}

/** Label for pre-filling a customer picker (e.g. /projects?new=1&customer=…). */
export async function customerOption(id: string | null | undefined): Promise<Option | null> {
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return null;
  await connectToDatabase();
  const c = await CustomerModel.findOne({ _id: id, archivedAt: null }).select("name businessName customerNumber").lean();
  if (!c) return null;
  return { value: c._id.toString(), label: c.name, description: [c.customerNumber, c.businessName].filter(Boolean).join(" · ") };
}
