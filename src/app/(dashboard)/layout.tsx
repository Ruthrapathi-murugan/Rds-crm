import { Suspense } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
