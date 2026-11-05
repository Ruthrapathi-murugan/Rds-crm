"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_GROUPS } from "@/config/nav";
import { siteConfig } from "@/config/site";
import type { Permission } from "@/lib/permissions";

export function AppSidebar({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0);

  // The longest matching href wins, so /settings/users doesn't also highlight /settings.
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-14 justify-center border-b">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 overflow-hidden rounded-md px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={() => isMobile && setOpenMobile(false)}
        >
          <LogoMark className="size-8 transition-transform duration-300 hover:rotate-[-6deg]" />
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">{siteConfig.productName}</span>
            <span className="text-muted-foreground truncate text-[11px]">{siteConfig.companyName}</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link
                          href={item.href}
                          onClick={() => isMobile && setOpenMobile(false)}
                          aria-current={active ? "page" : undefined}
                          className="relative transition-colors duration-200"
                        >
                          {active && (
                            <span
                              aria-hidden="true"
                              className="bg-primary animate-fade-in absolute top-1/2 -left-2 h-5 w-1 -translate-y-1/2 rounded-r-full group-data-[collapsible=icon]:hidden"
                            />
                          )}
                          <item.icon aria-hidden="true" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t group-data-[collapsible=icon]:hidden">
        <p className="text-muted-foreground px-2 text-[11px]">{siteConfig.location}</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
