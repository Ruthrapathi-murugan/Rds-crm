"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NAV_GROUPS } from "@/config/nav";

const NAV_TITLES = new Map(NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.href, i.title] as const)));
const SEGMENT_TITLES: Record<string, string> = { new: "New", edit: "Edit" };

function titleFor(href: string, segment: string) {
  const known = NAV_TITLES.get(href) ?? SEGMENT_TITLES[segment];
  if (known) return known;
  // Record ids (Mongo ObjectIds etc.) read better as "Details".
  if (/^[0-9a-f]{12,}$/i.test(segment)) return "Details";
  return segment.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Breadcrumb trail derived from the URL, shown in the header on larger screens. */
export function HeaderBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((segment, i) => {
    const href = `/${segments.slice(0, i + 1).join("/")}`;
    return { href, title: titleFor(href, segment) };
  });

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb className="hidden min-w-0 md:block">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, i) => (
          <Fragment key={crumb.href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="animate-fade-in min-w-0" style={{ "--delay": `${i * 60}ms` } as React.CSSProperties}>
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate font-medium">{crumb.title}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href} className="truncate">
                    {crumb.title}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
