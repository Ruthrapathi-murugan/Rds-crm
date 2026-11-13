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
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="h-16 justify-center">
        <Link
          href="/dashboard"
          className="group/logo flex items-center gap-2.5 overflow-hidden rounded-xl px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={() => isMobile && setOpenMobile(false)}
        >
          <LogoMark className="shadow-glow size-9 rounded-[10px] transition-transform duration-500 ease-out group-hover/logo:scale-105 group-hover/logo:rotate-[-8deg]" />
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold tracking-tight">{siteConfig.productName}</span>
            <span className="text-muted-foreground truncate text-[11px]">{siteConfig.companyName}</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            <SidebarGroupLabel className="text-muted-foreground/80 text-[10.5px] font-semibold tracking-[0.08em] uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="group/nav relative h-9 rounded-xl transition-[color,background-color,width,height,padding] duration-200 data-active:bg-transparent data-active:text-white data-active:hover:bg-transparent data-active:hover:text-white"
                      >
                        <Link
                          href={item.href}
                          onClick={() => isMobile && setOpenMobile(false)}
                          aria-current={active ? "page" : undefined}
                        >
                          {active && (
                            <span
                              aria-hidden="true"
                              className="bg-brand shadow-glow animate-pill-in absolute inset-0 rounded-xl"
                            />
                          )}
                          <item.icon
                            aria-hidden="true"
                            className="relative transition-transform duration-300 ease-out group-hover/nav:scale-110 group-hover/nav:-rotate-6"
                          />
                          <span className="relative transition-transform duration-200 group-hover/nav:translate-x-0.5">
                            {item.title}
                          </span>
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
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <div className="bg-primary/8 relative overflow-hidden rounded-xl p-3 ring-1 ring-[color-mix(in_oklch,var(--primary)_18%,transparent)]">
          <div className="bg-brand absolute -top-8 -right-8 size-20 rounded-full opacity-20 blur-2xl" aria-hidden="true" />
          <p className="relative text-xs font-medium">{siteConfig.companyName}</p>
          <p className="text-muted-foreground relative text-[11px]">{siteConfig.location}</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
