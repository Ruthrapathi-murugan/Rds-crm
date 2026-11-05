import "server-only";
import { Types } from "mongoose";
import { NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import type { SessionUser } from "@/types";

type Filter = Record<string, unknown>;

/**
 * Record-level access. Users with `records:all` see everything; others
 * (Staff) only see records assigned to them or created by them.
 */
export function ownershipFilter(user: SessionUser, fields: readonly string[] = ["assignedTo", "createdBy"]): Filter {
  if (hasPermission(user, "records:all")) return {};
  const id = new Types.ObjectId(user.id);
  return { $or: fields.map((field) => ({ [field]: id })) };
}

export function canSeeAll(user: SessionUser) {
  return hasPermission(user, "records:all");
}

/** Combines filters with $and, dropping empty ones. */
export function andFilters(...filters: Filter[]): Filter {
  const parts = filters.filter((f) => Object.keys(f).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/** Parses an id from a URL; malformed ids are treated as "not found". */
export function toObjectId(id: string, what = "Record"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id) || !/^[a-f0-9]{24}$/i.test(id)) throw new NotFoundError(what);
  return new Types.ObjectId(id);
}

export function isObjectIdString(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
}
