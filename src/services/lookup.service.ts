import "server-only";
import type { ClientSession, Types } from "mongoose";
import { BadRequestError } from "@/lib/errors";
import { ServiceModel } from "@/models/service";
import { UserModel } from "@/models/user";

/** Ensures an "assigned to" user exists and is active. */
export async function assertAssignableUser(id: string | null | undefined, session?: ClientSession) {
  if (!id) return;
  const exists = await UserModel.exists({ _id: id, isActive: true }).session(session ?? null);
  if (!exists) throw new BadRequestError("The selected team member is not available.", { assignedTo: ["Choose an active team member"] });
}

export async function assertServiceExists(id: string | null | undefined, field = "service", session?: ClientSession) {
  if (!id) return;
  const exists = await ServiceModel.exists({ _id: id }).session(session ?? null);
  if (!exists) throw new BadRequestError("The selected service does not exist.", { [field]: ["Choose a service from the list"] });
}

/** Resolves user ids to names in one query. */
export async function userNames(ids: (Types.ObjectId | string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const users = await UserModel.find({ _id: { $in: unique } }).select("name").lean();
  return new Map(users.map((u) => [u._id.toString(), u.name]));
}

export async function serviceNames(ids: (Types.ObjectId | string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const services = await ServiceModel.find({ _id: { $in: unique } }).select("name").lean();
  return new Map(services.map((s) => [s._id.toString(), s.name]));
}

export function idOrNull(value: Types.ObjectId | string | null | undefined): string | null {
  return value ? value.toString() : null;
}

export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
