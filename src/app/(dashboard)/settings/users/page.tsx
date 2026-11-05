import type { Metadata } from "next";
import { Suspense } from "react";
import { KeyRound, Lock, UserCog } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataCard } from "@/components/data-table/data-card";
import { TableSkeleton } from "@/components/data-table/table-skeleton";
import { AddUserButton } from "@/components/settings/add-user-button";
import { SettingsNav, SettingsNavSkeleton } from "@/components/settings/settings-nav";
import { UserRowActions } from "@/components/settings/user-row-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/constants";
import { canManageRole, hasPermission } from "@/lib/permissions";
import type { Tone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/date";
import { listUsers } from "@/services/user.service";

export const metadata: Metadata = { title: "Users" };

const ROLE_TONES: Record<Role, Tone> = { super_admin: "violet", admin: "primary", manager: "info", staff: "neutral" };

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function HeaderActions() {
  const user = await requireUser();
  if (!hasPermission(user, "users:manage")) return null;
  return <AddUserButton assignableRoles={ROLES.filter((role) => canManageRole(user.role, role))} />;
}

async function UsersList() {
  const actor = await requireUser();
  if (!hasPermission(actor, "users:manage")) return <AccessDenied />;
  const users = await listUsers();
  const assignableRoles = ROLES.filter((role) => canManageRole(actor.role, role));
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="animate-fade-up flex flex-col gap-3" style={{ "--delay": "60ms" } as React.CSSProperties}>
      <DataCard>
        {users.length === 0 ? (
          <EmptyState icon={UserCog} title="No users yet" description="Add your team so they can sign in." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden sm:table-cell">Role</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="stagger">
              {users.map((u) => {
                const isSelf = u.id === actor.id;
                const canManage = canManageRole(actor.role, u.role);
                return (
                  <TableRow key={u.id} className={cn(!u.isActive && "text-muted-foreground")}>
                    <TableCell className="max-w-72">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            u.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {initialsOf(u.name)}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-foreground truncate font-medium">
                            {u.name}
                            {isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">{u.email}</span>
                          <span className="mt-1 flex flex-wrap gap-1.5 sm:hidden">
                            <StatusBadge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</StatusBadge>
                            <StatusBadge tone={u.isActive ? "success" : "muted"}>{u.isActive ? "Active" : "Inactive"}</StatusBadge>
                          </span>
                          {u.mustChangePassword && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <KeyRound className="size-3" aria-hidden="true" />
                              Must change password
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                      {u.phone || "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</StatusBadge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge tone={u.isActive ? "success" : "muted"}>{u.isActive ? "Active" : "Inactive"}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <UserRowActions user={u} isSelf={isSelf} assignableRoles={assignableRoles} />
                      ) : (
                        <span className="text-muted-foreground flex size-8 items-center justify-center" title="Only a Super Admin can change this account">
                          <Lock className="size-4" aria-hidden="true" />
                          <span className="sr-only">Only a Super Admin can change this account</span>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataCard>
      <p className="text-muted-foreground text-sm">
        {activeCount} active of {users.length} {users.length === 1 ? "user" : "users"}. Deactivated users keep their history but cannot sign in.
      </p>
    </div>
  );
}

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users"
        description="Team members, their roles and sign-in access."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      >
        <Suspense fallback={<SettingsNavSkeleton />}>
          <SettingsNav active="users" />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<TableSkeleton columns={5} toolbar={false} />}>
        <UsersList />
      </Suspense>
    </>
  );
}
