import type { Metadata } from "next";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DetailList } from "@/components/common/detail-list";
import { PageHeader } from "@/components/common/page-header";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { ROLE_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "My account" };

async function AccountDetails() {
  const user = await requireUser();
  return (
    <div className="stagger grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name and role are managed by an administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList
            columns={1}
            items={[
              { label: "Name", value: user.name },
              { label: "Email", value: user.email },
              { label: "Role", value: ROLE_LABELS[user.role] },
            ]}
          />
        </CardContent>
      </Card>
      <Card id="password" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Changing your password signs you out on every other device.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountPage() {
  return (
    <>
      <PageHeader title="My account" description="Your profile and sign-in security." />
      <Suspense fallback={<DetailSkeleton />}>
        <AccountDetails />
      </Suspense>
    </>
  );
}
