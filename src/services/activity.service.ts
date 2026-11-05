import "server-only";
import { Types, type ClientSession } from "mongoose";
import type { EntityType } from "@/lib/constants";
import { escapeRegex, paginated, skipFor } from "@/lib/list-params";
import { connectToDatabase } from "@/lib/mongodb";
import { ActivityLogModel } from "@/models/activity-log";
import type { ListParams, Paginated, SessionUser } from "@/types";

export type ActivityInput = {
  actor?: Pick<SessionUser, "id" | "name"> | null;
  action: string;
  entityType: EntityType;
  entityId?: Types.ObjectId | string | null;
  entityLabel?: string;
  message: string;
  /** Marks an audit event (security, permissions, money). */
  sensitive?: boolean;
  ipAddress?: string;
  /** Small, non-personal context only (ids, old/new status). Never secrets. */
  meta?: Record<string, unknown>;
};

/**
 * Appends to the activity log. Inside a transaction pass `session` so the log
 * commits atomically with the change; otherwise logging failures are
 * reported but never break the user's action.
 */
export async function logActivity(input: ActivityInput, session?: ClientSession) {
  const doc = {
    actor: input.actor?.id,
    actorName: input.actor?.name,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? undefined,
    entityLabel: input.entityLabel,
    message: input.message,
    sensitive: input.sensitive ?? false,
    ipAddress: input.ipAddress,
    meta: input.meta,
  };
  if (session) {
    await ActivityLogModel.create([doc], { session });
    return;
  }
  try {
    await connectToDatabase();
    await ActivityLogModel.create(doc);
  } catch (error) {
    console.error("[activity] failed to write log entry:", error instanceof Error ? error.message : error);
  }
}

export type ActivityEntry = {
  id: string;
  action: string;
  message: string;
  actorName: string;
  entityType: EntityType;
  entityId: string | null;
  entityLabel: string | null;
  createdAt: string;
};

export async function listEntityActivity(entityType: EntityType, entityId: string, limit = 30): Promise<ActivityEntry[]> {
  await connectToDatabase();
  const rows = await ActivityLogModel.find({ entityType, entityId }).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map(toActivityEntry);
}

export function toActivityEntry(row: {
  _id: Types.ObjectId;
  action: string;
  message: string;
  actorName?: string | null;
  entityType: string;
  entityId?: Types.ObjectId | null;
  entityLabel?: string | null;
  createdAt: Date;
}): ActivityEntry {
  return {
    id: row._id.toString(),
    action: row.action,
    message: row.message,
    actorName: row.actorName ?? "System",
    entityType: row.entityType as EntityType,
    entityId: row.entityId?.toString() ?? null,
    entityLabel: row.entityLabel ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Audit log ───────────────────────────────────────────────────────────

/** Event groups for the audit-log filter, keyed by action prefix ("auth" → "auth.*"). */
export const AUDIT_EVENT_GROUPS = [
  { value: "auth", label: "Sign-in & passwords" },
  { value: "user", label: "Users & roles" },
  { value: "settings", label: "Company settings" },
  { value: "invoice", label: "Invoices" },
  { value: "payment", label: "Payments" },
  { value: "quotation", label: "Quotations" },
  { value: "customer", label: "Customers" },
  { value: "lead", label: "Leads" },
  { value: "project", label: "Projects" },
  { value: "task", label: "Tasks" },
  { value: "service", label: "Services" },
] as const;

export type AuditEventGroup = (typeof AUDIT_EVENT_GROUPS)[number]["value"];

export type AuditEntry = ActivityEntry & { ipAddress: string | null; sensitive: boolean };

export type AuditLogFilters = {
  /** User id of the person who acted. */
  actor?: string;
  /** Action prefix such as "auth" (matches auth.*) or an exact action such as "auth.login". */
  action?: string;
  /** Inclusive range. Strings are IST calendar days ("yyyy-MM-dd"). */
  from?: Date | string;
  to?: Date | string;
  /** Only security, permission and money events. Defaults to true. */
  sensitiveOnly?: boolean;
};

function auditBoundary(value: Date | string | undefined, edge: "start" | "end"): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00+05:30`); // IST has no DST
  if (Number.isNaN(start.getTime())) return null;
  return edge === "start" ? start : new Date(start.getTime() + 86_400_000 - 1);
}

/**
 * Read-only, paginated view of the activity log for administrators. The
 * caller checks the `audit:read` permission. Newest first by default.
 */
export async function listAuditLog(
  params: ListParams,
  filters: AuditLogFilters = {},
): Promise<Paginated<AuditEntry>> {
  await connectToDatabase();
  const filter: Record<string, unknown> = {};
  if (filters.sensitiveOnly ?? true) filter.sensitive = true;
  if (filters.actor && Types.ObjectId.isValid(filters.actor)) filter.actor = new Types.ObjectId(filters.actor);
  if (filters.action && /^[a-z_]+(\.[a-z_]+)?$/.test(filters.action)) {
    filter.action = filters.action.includes(".")
      ? filters.action
      : { $regex: new RegExp(`^${escapeRegex(filters.action)}\\.`) };
  }
  const from = auditBoundary(filters.from, "start");
  const to = auditBoundary(filters.to, "end");
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (params.q) {
    const re = new RegExp(escapeRegex(params.q), "i");
    filter.$or = [{ message: re }, { entityLabel: re }, { actorName: re }, { action: re }, { ipAddress: re }];
  }

  const [rows, total] = await Promise.all([
    ActivityLogModel.find(filter)
      .sort({ createdAt: params.dir === "asc" ? 1 : -1, _id: params.dir === "asc" ? 1 : -1 })
      .skip(skipFor(params))
      .limit(params.pageSize)
      .lean(),
    ActivityLogModel.countDocuments(filter),
  ]);
  return paginated(
    rows.map((row) => ({
      ...toActivityEntry(row),
      ipAddress: row.ipAddress ?? null,
      sensitive: Boolean(row.sensitive),
    })),
    total,
    params,
  );
}
