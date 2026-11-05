"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Role } from "@/lib/constants";
import type { Permission } from "@/lib/permissions";
import { GlobalSearch } from "./global-search";
import { NotificationsBell } from "./notifications-bell";
import { UserMenu } from "./user-menu";

export function AppHeader({
  user,
}: {
  user: { name: string; email: string; role: Role; permissions: Permission[] };
}) {
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-md sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <GlobalSearch permissions={user.permissions} />
      <div className="ml-auto flex items-center gap-1">
        <NotificationsBell />
        <UserMenu name={user.name} email={user.email} role={user.role} />
      </div>
    </header>
  );
}
