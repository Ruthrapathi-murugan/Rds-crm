import {
  BarChart3,
  BriefcaseBusiness,
  FileText,
  FolderKanban,
  IndianRupee,
  Layers,
  LayoutDashboard,
  ListChecks,
  Receipt,
  ScrollText,
  Settings,
  UserCog,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export type NavItem = { title: string; href: string; icon: LucideIcon; permission?: Permission };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { title: "Leads", href: "/leads", icon: UserPlus, permission: "leads:read" },
      { title: "Customers", href: "/customers", icon: BriefcaseBusiness, permission: "customers:read" },
      { title: "Quotations", href: "/quotations", icon: FileText, permission: "quotations:read" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { title: "Projects", href: "/projects", icon: FolderKanban, permission: "projects:read" },
      { title: "Tasks", href: "/tasks", icon: ListChecks, permission: "tasks:read" },
      { title: "Services", href: "/services", icon: Layers, permission: "services:read" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Invoices", href: "/invoices", icon: Receipt, permission: "invoices:read" },
      { title: "Payments", href: "/payments", icon: IndianRupee, permission: "payments:read" },
      { title: "Reports", href: "/reports", icon: BarChart3, permission: "reports:read" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Settings", href: "/settings", icon: Settings, permission: "settings:manage" },
      { title: "Users", href: "/settings/users", icon: UserCog, permission: "users:manage" },
      { title: "Audit log", href: "/settings/audit", icon: ScrollText, permission: "audit:read" },
    ],
  },
];
