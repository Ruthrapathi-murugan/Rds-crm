"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Role } from "@/lib/constants";
import type { Permission } from "@/lib/permissions";
import { GlobalSearch } from "./global-search";
import { HeaderBreadcrumbs } from "./header-breadcrumbs";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppHeader({
  user,
}: {
  user: { name: string; email: string; role: Role; permissions: Permission[] };
}) {
  return (
    <div className="no-print sticky top-0 z-30 px-2 pt-2 md:pl-0">
      <header className="glass-panel animate-fade-in flex h-14 shrink-0 items-center gap-2 rounded-2xl px-3 sm:px-4">
        <SidebarTrigger className="-ml-1 rounded-lg" />
        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
        <HeaderBreadcrumbs />
        <div className="ml-auto flex items-center gap-1">
          <GlobalSearch permissions={user.permissions} />
          <ThemeToggle />
          <NotificationsBell />
          <UserMenu name={user.name} email={user.email} role={user.role} />
        </div>
      </header>
    </div>
  );
}
