import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { Role } from "@/lib/constants";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { hasPermission, permissionsFor, type Permission } from "@/lib/permissions";
import type { UserDoc } from "@/models/user";
import type { SessionUser } from "@/types";
import { readSessionCookie, validateSessionToken } from "./session";

export function toSessionUser(user: UserDoc): SessionUser {
  const role = user.role as Role;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role,
    permissions: permissionsFor(role),
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

/**
 * The signed-in user for this request, validated against the database.
 * Memoised per request, so pages and components can call it freely.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  // Validation compares expiry times against the clock: request-time only.
  await connection();
  const result = await validateSessionToken(token);
  return result ? toSessionUser(result.user) : null;
});

/** For pages: redirects to the login screen when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For API routes and services: throws 401/403 instead of redirecting. */
export async function requireApiUser(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (permission) assertPermission(user, permission);
  return user;
}

export function assertPermission(user: SessionUser, permission: Permission) {
  if (!hasPermission(user, permission)) throw new ForbiddenError();
}
