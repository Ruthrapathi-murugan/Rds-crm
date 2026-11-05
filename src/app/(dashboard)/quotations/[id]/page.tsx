import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { DetailList } from "@/components/common/detail-list";
import { PageHeader } from "@/components/common/page-header";
import { EnumBadge } from "@/components/common/status-badge";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { DocumentPreview } from "@/components/finance/document-preview";
import { QuotationActions } from "@/components/finance/quotation-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { QUOTATION_STATUS_LABELS, TAX_MODE_LABELS } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { QUOTATION_STATUS_TONES } from "@/lib/status-tones";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { listEntityActivity } from "@/services/activity.service";
import { sellerSnapshot } from "@/services/finance/documents";
import { getQuotation } from "@/services/quotation.service";
import { getCompanySettings } from "@/services/settings.service";

export const metadata: Metadata = { title: "Quotation" };

async function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "quotations:read")) return <AccessDenied />;
  const { id } = await params;
  const quotation = await getQuotation(user, id);
  if (!quotation) notFound();
  const [activity, settings] = await Promise.all([listEntityActivity("quotation", quotation.id), getCompanySettings()]);

  return (
    <>
      <PageHeader
        back={{ href: "/quotations", label: "Quotations" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {quotation.quotationNumber}
            <EnumBadge value={quotation.status} labels={QUOTATION_STATUS_LABELS} tones={QUOTATION_STATUS_TONES} />
          </span>
        }
        description={`${quotation.customerName} · ${formatINR(quotation.totalPaise)} · valid until ${formatDate(quotation.validUntil)}`}
        actions={
          <QuotationActions
            id={quotation.id}
            number={quotation.quotationNumber}
            storedStatus={quotation.storedStatus}
            allowedTransitions={quotation.allowedTransitions}
            editable={quotation.editable}
            canWrite={hasPermission(user, "quotations:write")}
            canConvert={hasPermission(user, "quotations:write") && hasPermission(user, "invoices:write")}
          />
        }
      />
      <div className="stagger grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <DocumentPreview
          title="Quotation"
          number={quotation.quotationNumber}
          issueDate={quotation.issueDate}
          secondaryDate={quotation.validUntil}
          secondaryLabel="Valid until"
          seller={sellerSnapshot(settings)}
          billTo={quotation.billTo}
          placeOfSupply={quotation.billTo.state}
          taxMode={quotation.taxMode}
          items={quotation.items}
          totals={quotation.totals}
          terms={quotation.terms}
          notes={quotation.notes}
          stamp={quotation.storedStatus === "draft" ? { label: "DRAFT", tone: "muted" } : null}
        />
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={1}
                items={[
                  { label: "Customer", value: <Link className="text-primary hover:underline" href={`/customers/${quotation.customerId}`}>{quotation.customerName}</Link> },
                  { label: "Tax treatment", value: TAX_MODE_LABELS[quotation.taxMode] },
                  { label: "Lead", value: quotation.leadId ? <Link className="text-primary hover:underline" href={`/leads/${quotation.leadId}`}>{quotation.leadName}</Link> : null },
                  { label: "Project", value: quotation.projectId ? <Link className="text-primary hover:underline" href={`/projects/${quotation.projectId}`}>{quotation.projectName}</Link> : null },
                  { label: "Converted to", value: quotation.convertedInvoiceId ? <Link className="text-primary hover:underline" href={`/invoices/${quotation.convertedInvoiceId}`}>View invoice</Link> : null },
                  { label: "Sent", value: quotation.sentAt ? formatDateTime(quotation.sentAt) : null },
                  { label: "Created by", value: quotation.createdByName },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function QuotationPage(props: PageProps<"/quotations/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <QuotationDetail params={props.params} />
    </Suspense>
  );
}
