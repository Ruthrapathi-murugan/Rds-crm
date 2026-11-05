import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { PageHeader } from "@/components/common/page-header";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { SettingsForm } from "@/components/settings/settings-form";
import { SettingsNav, SettingsNavSkeleton } from "@/components/settings/settings-nav";
import { requireUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions";
import { getCompanySettings } from "@/services/settings.service";

export const metadata: Metadata = { title: "Company settings" };

async function CompanySettingsContent() {
  const user = await requireUser();
  if (!hasPermission(user, "settings:manage")) return <AccessDenied />;
  const settings = await getCompanySettings();
  return <SettingsForm initial={settings} />;
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Business details, GST, tax rates, numbering and document defaults.">
        <Suspense fallback={<SettingsNavSkeleton />}>
          <SettingsNav active="company" />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<DetailSkeleton />}>
        <CompanySettingsContent />
      </Suspense>
    </>
  );
}
