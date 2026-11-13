import { ForcePasswordChange } from "@/components/account/force-password-change";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth/current-user";
import { AppBackground } from "./app-background";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { PageTransition } from "./page-transition";

/**
 * Authenticated application frame. Validates the session (redirecting to the
 * login page when signed out) and renders the floating sidebar and header
 * around the page. Rendered inside <Suspense> by the dashboard layout.
 */
export async function DashboardShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) return <ForcePasswordChange name={user.name} />;

  return (
    <SidebarProvider>
      <AppBackground />
      <AppSidebar permissions={user.permissions} />
      <SidebarInset className="min-w-0 bg-transparent">
        <AppHeader user={{ name: user.name, email: user.email, role: user.role, permissions: user.permissions }} />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
          <PageTransition>{children}</PageTransition>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
