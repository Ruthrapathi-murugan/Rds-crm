import type { Role } from "@/lib/constants";

/**
 * Role-based permissions. Every protected API operation and page checks one
 * of these on the server; the UI uses the same map only to hide controls.
 *
 * `records:all` lets a user see every record. Without it (Staff), lists and
 * lookups are limited to records assigned to or created by the user.
 */
export const PERMISSIONS = [
  "records:all",
  "leads:read",
  "leads:write",
  "leads:archive",
  "leads:convert",
  "customers:read",
  "customers:write",
  "customers:archive",
  "services:read",
  "services:manage",
  "projects:read",
  "projects:write",
  "projects:archive",
  "tasks:read",
  "tasks:write",
  "quotations:read",
  "quotations:write",
  "invoices:read",
  "invoices:write",
  "invoices:cancel",
  "payments:read",
  "payments:write",
  "payments:void",
  "reports:read",
  "users:manage",
  "settings:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: readonly Permission[] = [
  "records:all",
  "leads:read",
  "leads:write",
  "leads:archive",
  "leads:convert",
  "customers:read",
  "customers:write",
  "customers:archive",
  "services:read",
  "projects:read",
  "projects:write",
  "projects:archive",
  "tasks:read",
  "tasks:write",
  "quotations:read",
  "quotations:write",
  "invoices:read",
  "invoices:write",
  "invoices:cancel",
  "payments:read",
  "payments:write",
  "reports:read",
];

const STAFF: readonly Permission[] = [
  "leads:read",
  "leads:write",
  "leads:convert",
  "customers:read",
  "customers:write",
  "services:read",
  "projects:read",
  "projects:write",
  "tasks:read",
  "tasks:write",
  "quotations:read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: PERMISSIONS,
  manager: MANAGER,
  staff: STAFF,
};

/** Higher rank can manage lower ranks. */
export const ROLE_RANK: Record<Role, number> = { super_admin: 4, admin: 3, manager: 2, staff: 1 };

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(user: { permissions: readonly string[] } | null | undefined, permission: Permission) {
  return Boolean(user?.permissions.includes(permission));
}

/**
 * Whether `actor` may create, edit or deactivate a user with `targetRole`.
 * Super Admins manage everyone; Admins manage Managers and Staff only.
 */
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "super_admin") return true;
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole] && ROLE_PERMISSIONS[actorRole].includes("users:manage");
}
