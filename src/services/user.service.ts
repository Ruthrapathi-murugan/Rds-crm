import "server-only";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/mongodb";
import { canManageRole } from "@/lib/permissions";
import type { CreateUserData, UpdateUserData } from "@/lib/validations/auth";
import { UserModel, type UserDoc } from "@/models/user";
import type { Option, SessionUser } from "@/types";
import { logActivity } from "./activity.service";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

function toUserRow(user: UserDoc): UserRow {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    role: user.role as Role,
    isActive: Boolean(user.isActive),
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listUsers(): Promise<UserRow[]> {
  await connectToDatabase();
  const users = await UserModel.find().sort({ isActive: -1, name: 1 }).lean();
  return users.map(toUserRow);
}

/** Active users for "assigned to" pickers. Names only, no contact details. */
export async function userOptions(): Promise<Option[]> {
  await connectToDatabase();
  const users = await UserModel.find({ isActive: true }).select("name role").sort({ name: 1 }).lean();
  return users.map((u) => ({ value: u._id.toString(), label: u.name, description: ROLE_LABELS[u.role as Role] }));
}

export async function createUser(actor: SessionUser, input: CreateUserData) {
  if (!canManageRole(actor.role, input.role)) {
    throw new ForbiddenError(`You cannot create ${ROLE_LABELS[input.role]} accounts.`);
  }
  await connectToDatabase();
  if (await UserModel.exists({ email: input.email })) {
    throw new ConflictError("A user with this email already exists.");
  }
  const temporaryPassword = generateTemporaryPassword();
  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: input.role,
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
    createdBy: actor.id,
  });
  await logActivity({
    actor,
    action: "user.created",
    entityType: "user",
    entityId: user._id,
    entityLabel: user.name,
    message: `Created ${ROLE_LABELS[input.role]} account for ${user.name}`,
    sensitive: true,
    meta: { role: input.role },
  });
  return { user: toUserRow(user.toObject() as UserDoc), temporaryPassword };
}

export async function updateUser(actor: SessionUser, id: string, input: UpdateUserData) {
  await connectToDatabase();
  const user = await UserModel.findById(id);
  if (!user) throw new NotFoundError("User");
  const currentRole = user.role as Role;

  if (!canManageRole(actor.role, currentRole) || !canManageRole(actor.role, input.role)) {
    throw new ForbiddenError("You cannot change this account.");
  }
  if (user._id.toString() === actor.id && (input.role !== currentRole || !input.isActive)) {
    throw new BadRequestError("You cannot change your own role or deactivate yourself.");
  }
  if (currentRole === "super_admin" && (input.role !== "super_admin" || !input.isActive)) {
    const others = await UserModel.countDocuments({ role: "super_admin", isActive: true, _id: { $ne: user._id } });
    if (others === 0) throw new BadRequestError("At least one active Super Admin is required.");
  }

  const roleChanged = currentRole !== input.role;
  const deactivated = Boolean(user.isActive) && !input.isActive;
  user.set({ name: input.name, phone: input.phone, role: input.role, isActive: input.isActive });
  await user.save();

  if (roleChanged || deactivated) await revokeUserSessions(user._id);
  await logActivity({
    actor,
    action: deactivated ? "user.deactivated" : roleChanged ? "user.role_changed" : "user.updated",
    entityType: "user",
    entityId: user._id,
    entityLabel: user.name,
    message: deactivated
      ? `Deactivated ${user.name}`
      : roleChanged
        ? `Changed ${user.name}'s role from ${ROLE_LABELS[currentRole]} to ${ROLE_LABELS[input.role]}`
        : `Updated ${user.name}'s profile`,
    sensitive: roleChanged || deactivated || input.isActive !== Boolean(user.isActive),
    meta: roleChanged ? { from: currentRole, to: input.role } : undefined,
  });
  return toUserRow(user.toObject() as UserDoc);
}

export async function resetUserPassword(actor: SessionUser, id: string) {
  await connectToDatabase();
  const user = await UserModel.findById(id);
  if (!user) throw new NotFoundError("User");
  if (user._id.toString() === actor.id) {
    throw new BadRequestError("Use Account settings to change your own password.");
  }
  if (!canManageRole(actor.role, user.role as Role)) throw new ForbiddenError("You cannot reset this password.");

  const temporaryPassword = generateTemporaryPassword();
  user.set({
    passwordHash: await hashPassword(temporaryPassword),
    passwordChangedAt: new Date(),
    mustChangePassword: true,
  });
  await user.save();
  await revokeUserSessions(user._id);
  await logActivity({
    actor,
    action: "user.password_reset",
    entityType: "user",
    entityId: user._id,
    entityLabel: user.name,
    message: `Reset the password for ${user.name}`,
    sensitive: true,
  });
  return { temporaryPassword };
}
