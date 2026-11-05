import "server-only";
import { Types } from "mongoose";
import {
  OPEN_TASK_STATUSES,
  PRIORITIES,
  TASK_STATUS_LABELS,
  type Priority,
  type TaskStatus,
} from "@/lib/constants";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { escapeRegex, paginated, skipFor } from "@/lib/list-params";
import { connectToDatabase } from "@/lib/mongodb";
import { endOfDayIST, endOfMonthIST, formatDateTime, parseDateInputIST, startOfDayIST } from "@/lib/utils/date";
import type { TaskFormData, TaskView } from "@/lib/validations/task";
import { CustomerModel } from "@/models/customer";
import { LeadModel } from "@/models/lead";
import { ProjectModel } from "@/models/project";
import { TaskModel, type TaskDoc } from "@/models/task";
import type { ListParams, Option, Paginated, SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import { assertAssignableUser, idOrNull, isoOrNull, userNames } from "./lookup.service";
import { notify } from "./notification.service";
import { andFilters, canSeeAll, ownershipFilter, toObjectId } from "./scope";

export const TASK_SORTS = ["dueAt", "createdAt", "title", "completedAt", "priority"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export type TaskFilters = {
  assignedTo?: string; // user id, "me"
  priority?: Priority;
};

export type RelatedRef = { id: string; label: string; href: string };

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueAt: string;
  reminderMinutes: number;
  remindAt: string | null;
  completedAt: string | null;
  assignedToId: string;
  assignedToName: string | null;
  createdById: string;
  lead: RelatedRef | null;
  customer: RelatedRef | null;
  project: RelatedRef | null;
  overdue: boolean;
  canDelete: boolean;
};

export type TaskViewCounts = Record<TaskView, number>;

const OPEN = { $in: [...OPEN_TASK_STATUSES] };
const isOpen = (status: string) => (OPEN_TASK_STATUSES as readonly string[]).includes(status);

/**
 * View filters on IST day boundaries. "today" and "overdue" overlap for a
 * task due earlier today that is still open — it is both.
 */
export function viewFilter(view: TaskView, now: Date): Record<string, unknown> {
  switch (view) {
    case "today":
      return { status: OPEN, dueAt: { $gte: startOfDayIST(now), $lte: endOfDayIST(now) } };
    case "upcoming":
      return { status: OPEN, dueAt: { $gt: endOfDayIST(now) } };
    case "overdue":
      return { status: OPEN, dueAt: { $lt: now } };
    case "completed":
      return { status: "completed" };
    default:
      return {};
  }
}

function extraFilter(user: SessionUser, filters: TaskFilters) {
  const filter: Record<string, unknown> = {};
  if (filters.priority) filter.priority = filters.priority;
  if (filters.assignedTo === "me") filter.assignedTo = new Types.ObjectId(user.id);
  else if (filters.assignedTo && /^[a-f0-9]{24}$/i.test(filters.assignedTo)) filter.assignedTo = new Types.ObjectId(filters.assignedTo);
  return filter;
}

function searchClause(q: string) {
  if (!q) return {};
  const re = new RegExp(escapeRegex(q), "i");
  return { $or: [{ title: re }, { description: re }] };
}

async function relatedLabels(docs: TaskDoc[]) {
  const ids = (key: "lead" | "customer" | "project") => [...new Set(docs.map((d) => d[key]?.toString()).filter(Boolean) as string[])];
  const [leads, customers, projects] = await Promise.all([
    ids("lead").length ? LeadModel.find({ _id: { $in: ids("lead") } }).select("contactName businessName").lean() : [],
    ids("customer").length ? CustomerModel.find({ _id: { $in: ids("customer") } }).select("name businessName").lean() : [],
    ids("project").length ? ProjectModel.find({ _id: { $in: ids("project") } }).select("name projectNumber").lean() : [],
  ]);
  return {
    lead: new Map(leads.map((l) => [l._id.toString(), l.contactName])),
    customer: new Map(customers.map((c) => [c._id.toString(), c.name])),
    project: new Map(projects.map((p) => [p._id.toString(), p.name])),
  };
}

async function toRows(user: SessionUser, docs: TaskDoc[], now: Date): Promise<TaskRow[]> {
  const [users, labels] = await Promise.all([userNames(docs.map((d) => d.assignedTo)), relatedLabels(docs)]);
  const ref = (kind: "lead" | "customer" | "project", id: Types.ObjectId | null | undefined): RelatedRef | null => {
    if (!id) return null;
    const label = labels[kind].get(id.toString());
    if (!label) return null;
    const base = kind === "lead" ? "/leads" : kind === "customer" ? "/customers" : "/projects";
    return { id: id.toString(), label, href: `${base}/${id.toString()}` };
  };
  return docs.map((d) => ({
    id: d._id.toString(),
    title: d.title,
    description: d.description ?? "",
    status: d.status as TaskStatus,
    priority: d.priority as Priority,
    dueAt: d.dueAt.toISOString(),
    reminderMinutes: d.reminderMinutes ?? 0,
    remindAt: isoOrNull(d.remindAt),
    completedAt: isoOrNull(d.completedAt),
    assignedToId: d.assignedTo.toString(),
    assignedToName: users.get(d.assignedTo.toString()) ?? null,
    createdById: d.createdBy.toString(),
    lead: ref("lead", d.lead),
    customer: ref("customer", d.customer),
    project: ref("project", d.project),
    overdue: isOpen(d.status) && d.dueAt.getTime() < now.getTime(),
    canDelete: canDeleteTask(user, d),
  }));
}

function canDeleteTask(user: SessionUser, task: { createdBy: Types.ObjectId }) {
  return canSeeAll(user) || task.createdBy.toString() === user.id;
}

export async function listTasks(
  user: SessionUser,
  view: TaskView,
  params: ListParams<TaskSort>,
  filters: TaskFilters = {},
): Promise<Paginated<TaskRow>> {
  await connectToDatabase();
  const now = new Date();
  const filter = andFilters(viewFilter(view, now), extraFilter(user, filters), searchClause(params.q), ownershipFilter(user));
  const dir = params.dir === "asc" ? 1 : -1;
  const total = await TaskModel.countDocuments(filter);
  let docs: TaskDoc[];
  if (params.sort === "priority") {
    // Priority is an enum; rank it (urgent first when descending) rather than sort alphabetically.
    docs = await TaskModel.aggregate<TaskDoc>([
      { $match: filter },
      {
        $addFields: {
          _rank: { $indexOfArray: [[...PRIORITIES], "$priority"] },
        },
      },
      { $sort: { _rank: dir, dueAt: 1, _id: -1 } },
      { $skip: skipFor(params) },
      { $limit: params.pageSize },
      { $project: { _rank: 0 } },
    ]);
  } else {
    docs = (await TaskModel.find(filter)
      .sort({ [params.sort]: dir, _id: -1 })
      .skip(skipFor(params))
      .limit(params.pageSize)
      .lean()) as TaskDoc[];
  }
  return paginated(await toRows(user, docs, now), total, params);
}

/** Default sort per view: soonest first for open work, latest first for history. */
export function defaultTaskSort(view: TaskView): { sort: TaskSort; dir: "asc" | "desc" } {
  if (view === "completed") return { sort: "completedAt", dir: "desc" };
  if (view === "all") return { sort: "dueAt", dir: "desc" };
  return { sort: "dueAt", dir: "asc" };
}

export async function taskViewCounts(user: SessionUser, filters: TaskFilters = {}): Promise<TaskViewCounts> {
  await connectToDatabase();
  const now = new Date();
  const views: TaskView[] = ["today", "upcoming", "overdue", "completed", "all"];
  const counts = await Promise.all(
    views.map((view) => TaskModel.countDocuments(andFilters(viewFilter(view, now), extraFilter(user, filters), ownershipFilter(user)))),
  );
  return Object.fromEntries(views.map((v, i) => [v, counts[i]])) as TaskViewCounts;
}

/** Tasks due within an IST calendar month ("yyyy-MM"); cancelled tasks are left out. */
export async function tasksForCalendar(user: SessionUser, month: string, filters: TaskFilters = {}): Promise<TaskRow[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestError("Choose a month like 2026-10.");
  await connectToDatabase();
  const start = parseDateInputIST(`${month}-01`);
  const end = endOfMonthIST(start);
  const docs = (await TaskModel.find(
    andFilters({ dueAt: { $gte: start, $lte: end }, status: { $ne: "cancelled" } }, extraFilter(user, filters), ownershipFilter(user)),
  )
    .sort({ dueAt: 1, _id: 1 })
    .limit(1000)
    .lean()) as TaskDoc[];
  return toRows(user, docs, new Date());
}

export type EntityRef = { lead?: string; customer?: string; project?: string };

export type EntityTasks = {
  open: TaskRow[];
  completed: TaskRow[];
  /** Picker labels for pre-filling the "Add task" form. */
  prefill: { customer: Option | null; lead: Option | null; project: Option | null };
};

/** Open tasks (soonest first) and recently completed ones for a lead, customer or project. */
export async function tasksForEntity(user: SessionUser, ref: EntityRef, completedLimit = 5): Promise<EntityTasks> {
  await connectToDatabase();
  const match: Record<string, unknown> = {};
  for (const key of ["lead", "customer", "project"] as const) {
    const id = ref[key];
    if (id) match[key] = toObjectId(id, "Record");
  }
  if (Object.keys(match).length === 0) throw new BadRequestError("Choose a lead, customer or project.");
  const now = new Date();
  const [openDocs, doneDocs, prefill] = await Promise.all([
    TaskModel.find(andFilters(match, { status: OPEN }, ownershipFilter(user))).sort({ dueAt: 1 }).limit(100).lean(),
    TaskModel.find(andFilters(match, { status: "completed" }, ownershipFilter(user)))
      .sort({ completedAt: -1 })
      .limit(completedLimit)
      .lean(),
    prefillOptions(ref),
  ]);
  const rows = await toRows(user, [...openDocs, ...doneDocs] as TaskDoc[], now);
  return { open: rows.slice(0, openDocs.length), completed: rows.slice(openDocs.length), prefill };
}

async function prefillOptions(ref: EntityRef): Promise<EntityTasks["prefill"]> {
  const [lead, project] = await Promise.all([
    ref.lead ? LeadModel.findById(ref.lead).select("contactName businessName leadNumber").lean() : null,
    ref.project ? ProjectModel.findById(ref.project).select("name projectNumber customer").lean() : null,
  ]);
  const customerId = ref.customer ?? project?.customer?.toString();
  const customer = customerId ? await CustomerModel.findById(customerId).select("name businessName customerNumber").lean() : null;
  return {
    lead: lead
      ? { value: lead._id.toString(), label: lead.contactName, description: [lead.leadNumber, lead.businessName].filter(Boolean).join(" · ") }
      : null,
    project: project ? { value: project._id.toString(), label: project.name, description: project.projectNumber } : null,
    customer: customer
      ? {
          value: customer._id.toString(),
          label: customer.name,
          description: [customer.customerNumber, customer.businessName].filter(Boolean).join(" · "),
        }
      : null,
  };
}

/** remindAt = dueAt − reminderMinutes, or none when reminders are off. */
export function computeRemindAt(dueAt: Date, reminderMinutes: number): Date | undefined {
  return reminderMinutes > 0 ? new Date(dueAt.getTime() - reminderMinutes * 60_000) : undefined;
}

/** Checks related records exist and that the user can see the lead/project. Fills the customer from the project. */
async function resolveRelations(user: SessionUser, data: TaskFormData) {
  const [lead, project, customer] = await Promise.all([
    data.lead ? LeadModel.findOne(andFilters({ _id: new Types.ObjectId(data.lead) }, ownershipFilter(user))).select("_id").lean() : null,
    data.project
      ? ProjectModel.findOne(andFilters({ _id: new Types.ObjectId(data.project) }, ownershipFilter(user))).select("customer").lean()
      : null,
    data.customer ? CustomerModel.exists({ _id: data.customer }) : null,
  ]);
  if (data.lead && !lead) throw new BadRequestError("The selected lead was not found.", { lead: ["Choose a lead from the list"] });
  if (data.project && !project) {
    throw new BadRequestError("The selected project was not found.", { project: ["Choose a project from the list"] });
  }
  if (data.customer && !customer) {
    throw new BadRequestError("The selected customer was not found.", { customer: ["Choose a customer from the list"] });
  }
  return {
    lead: data.lead ?? undefined,
    project: data.project ?? undefined,
    customer: data.customer ?? project?.customer?.toString() ?? undefined,
  };
}

async function findVisibleTask(user: SessionUser, id: string) {
  const task = await TaskModel.findOne(andFilters({ _id: toObjectId(id, "Task") }, ownershipFilter(user)));
  if (!task) throw new NotFoundError("Task");
  return task;
}

export async function createTask(user: SessionUser, data: TaskFormData) {
  await connectToDatabase();
  const [relations] = await Promise.all([resolveRelations(user, data), assertAssignableUser(data.assignedTo)]);
  const task = await TaskModel.create({
    title: data.title,
    description: data.description,
    ...relations,
    assignedTo: data.assignedTo,
    dueAt: data.dueAt,
    priority: data.priority,
    status: data.status,
    reminderMinutes: data.reminderMinutes,
    remindAt: computeRemindAt(data.dueAt, data.reminderMinutes),
    completedAt: data.status === "completed" ? new Date() : undefined,
    createdBy: user.id,
  });
  await logActivity({
    actor: user,
    action: "task.created",
    entityType: "task",
    entityId: task._id,
    entityLabel: task.title,
    message: `Created task “${task.title}” due ${formatDateTime(task.dueAt)}`,
    meta: { lead: relations.lead, customer: relations.customer, project: relations.project },
  });
  await notify(
    data.assignedTo,
    { type: "task.assigned", title: `Task assigned to you: ${task.title}`, message: `Due ${formatDateTime(task.dueAt)}`, link: "/tasks" },
    user,
  );
  return { id: task._id.toString() };
}

export async function updateTask(user: SessionUser, id: string, data: TaskFormData) {
  await connectToDatabase();
  const task = await findVisibleTask(user, id);
  const [relations] = await Promise.all([resolveRelations(user, data), assertAssignableUser(data.assignedTo)]);
  const previousAssignee = task.assignedTo.toString();
  const previousStatus = task.status as TaskStatus;
  const scheduleChanged = task.dueAt.getTime() !== data.dueAt.getTime() || (task.reminderMinutes ?? 0) !== data.reminderMinutes;

  task.set({
    title: data.title,
    description: data.description,
    lead: relations.lead,
    project: relations.project,
    customer: relations.customer,
    assignedTo: data.assignedTo,
    dueAt: data.dueAt,
    priority: data.priority,
    reminderMinutes: data.reminderMinutes,
    remindAt: computeRemindAt(data.dueAt, data.reminderMinutes),
  });
  // A new due time or lead time means a fresh reminder should go out.
  if (scheduleChanged) task.reminderSentAt = undefined;
  applyTaskStatus(task, data.status);
  await task.save();

  await logActivity({
    actor: user,
    action: "task.updated",
    entityType: "task",
    entityId: task._id,
    entityLabel: task.title,
    message:
      previousStatus !== task.status
        ? `Updated task and changed status from ${TASK_STATUS_LABELS[previousStatus]} to ${TASK_STATUS_LABELS[task.status as TaskStatus]}`
        : scheduleChanged
          ? `Updated task; now due ${formatDateTime(task.dueAt)}`
          : "Updated task details",
  });
  if (data.assignedTo !== previousAssignee) {
    await notify(
      data.assignedTo,
      { type: "task.assigned", title: `Task assigned to you: ${task.title}`, message: `Due ${formatDateTime(task.dueAt)}`, link: "/tasks" },
      user,
    );
  }
  return { id: task._id.toString() };
}

function applyTaskStatus(task: { status: string; completedAt?: Date | null }, status: TaskStatus) {
  if (status === "completed") {
    if (task.status !== "completed" || !task.completedAt) task.completedAt = new Date();
  } else {
    task.completedAt = undefined;
  }
  task.status = status;
}

export async function setTaskStatus(user: SessionUser, id: string, status: TaskStatus) {
  await connectToDatabase();
  const task = await findVisibleTask(user, id);
  const previous = task.status as TaskStatus;
  if (previous !== status) {
    applyTaskStatus(task, status);
    await task.save();
    await logActivity({
      actor: user,
      action: status === "completed" ? "task.completed" : "task.status_changed",
      entityType: "task",
      entityId: task._id,
      entityLabel: task.title,
      message:
        status === "completed"
          ? `Completed task “${task.title}”`
          : `Changed task status from ${TASK_STATUS_LABELS[previous]} to ${TASK_STATUS_LABELS[status]}`,
      meta: { from: previous, to: status },
    });
    if (status === "completed" && task.createdBy.toString() !== task.assignedTo.toString()) {
      await notify(task.createdBy, { type: "task.completed", title: `Task completed: ${task.title}`, link: "/tasks?view=completed" }, user);
    }
  }
  return { id: task._id.toString(), status: task.status as TaskStatus, completedAt: isoOrNull(task.completedAt) };
}

export async function deleteTask(user: SessionUser, id: string) {
  await connectToDatabase();
  const task = await findVisibleTask(user, id);
  if (!canDeleteTask(user, task)) throw new ForbiddenError("Only the person who created this task or a manager can delete it.");
  await task.deleteOne();
  await logActivity({
    actor: user,
    action: "task.deleted",
    entityType: "task",
    entityId: task._id,
    entityLabel: task.title,
    message: `Deleted task “${task.title}” (was due ${formatDateTime(task.dueAt)})`,
    meta: { lead: idOrNull(task.lead), customer: idOrNull(task.customer), project: idOrNull(task.project) },
  });
  return { id };
}
