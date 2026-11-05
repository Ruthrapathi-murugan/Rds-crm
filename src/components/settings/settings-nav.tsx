import Link from "next/link";
import { Building2, ScrollText, UserCog, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/current-user";
import { hasPermission, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export type SettingsSection = "company" | "users" | "audit";

const ITEMS: { key: SettingsSection; title: string; href: string; icon: LucideIcon; permission: Permission }[] = [
  { key: "company", title: "Company", href: "/settings", icon: Building2, permission: "settings:manage" },
  { key: "users", title: "Users", href: "/settings/users", icon: UserCog, permission: "users:manage" },
  { key: "audit", title: "Audit log", href: "/settings/audit", icon: ScrollText, permission: "audit:read" },
];

/** Sub-navigation shared by the administration pages; only shows sections the user may open. */
export async function SettingsNav({ active }: { active: SettingsSection }) {
  const user = await requireUser();
  const items = ITEMS.filter((item) => hasPermission(user, item.permission));
  if (items.length < 2) return null;
  return (
    <nav aria-label="Settings sections" className="animate-fade-up -mx-1 overflow-x-auto px-1">
      <ul className="bg-muted/60 inline-flex min-w-max items-center gap-1 rounded-lg p-1">
        {items.map((item) => {
          const current = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  current
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60",
                )}
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsNavSkeleton() {
  return <Skeleton className="h-10 w-80 max-w-full rounded-lg" />;
}
