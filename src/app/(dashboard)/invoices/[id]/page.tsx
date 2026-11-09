import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { DetailList } from "@/components/common/detail-list";
import { PageHeader } from "@/components/common/page-header";
import { EnumBadge, StatusBadge } from "@/components/common/status-badge";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { DocumentPreview } from "@/components/finance/document-preview";
import { InvoiceActions } from "@/components/finance/invoice-actions";
import { PaymentRowActions } from "@/components/finance/payment-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/current-user";
import { isEmailConfigured } from "@/lib/env";
import { INVOICE_STATUS_LABELS, PAYMENT_STATUS_LABELS, TAX_MODE_LABELS } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { INVOICE_STATUS_TONES, PAYMENT_STATUS_TONES } from "@/lib/status-tones";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { listEntityActivity } from "@/services/activity.service";
import { getInvoice } from "@/services/invoice.service";

export const metadata: Metadata = { title: "Invoice" };

async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "invoices:read")) return <AccessDenied />;
  const { id } = await params;
  const invoice = await getInvoice(user, id);
  if (!invoice) notFound();
  const activity = await listEntityActivity("invoice", invoice.id);
  const label = invoice.invoiceNumber ?? "Draft invoice";
  const paidPercent = invoice.totalPaise ? Math.round((invoice.amountPaidPaise / invoice.totalPaise) * 100) : 0;
  const stamp =
    invoice.storedStatus === "draft"
      ? { label: "DRAFT", tone: "muted" as const }
      : invoice.storedStatus === "cancelled"
        ? { label: "CANCELLED", tone: "danger" as const }
        : invoice.storedStatus === "paid"
          ? { label: "PAID", tone: "success" as const }
          : null;

  return (
    <>
      <PageHeader
        back={{ href: "/invoices", label: "Invoices" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {label}
            <EnumBadge value={invoice.status} labels={INVOICE_STATUS_LABELS} tones={INVOICE_STATUS_TONES} />
          </span>
        }
        description={`${invoice.title} · ${invoice.customerName} · due ${formatDate(invoice.dueDate)}`}
        actions={
          <InvoiceActions
            id={invoice.id}
            label={label}
            storedStatus={invoice.storedStatus}
            balancePaise={invoice.balancePaise}
            customerEmail={invoice.billTo.email}
            emailEnabled={isEmailConfigured()}
            permissions={{
              write: hasPermission(user, "invoices:write"),
              cancel: hasPermission(user, "invoices:cancel"),
              recordPayment: hasPermission(user, "payments:write"),
            }}
          />
        }
      />
      {invoice.storedStatus === "cancelled" && (
        <div className="animate-fade-up rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          Cancelled {invoice.cancelledAt ? `on ${formatDateTime(invoice.cancelledAt)}` : ""}: {invoice.cancelReason}
        </div>
      )}
      <div className="stagger grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DocumentPreview
            title={invoice.storedStatus === "draft" ? `Draft ${invoice.title}` : invoice.title}
            number={invoice.invoiceNumber ?? "Assigned when issued"}
            issueDate={invoice.issueDate}
            secondaryDate={invoice.dueDate}
            secondaryLabel="Due date"
            seller={invoice.seller ?? { name: "", address: "", gstin: "", email: "", phone: "" }}
            billTo={invoice.billTo}
            placeOfSupply={invoice.placeOfSupply}
            taxMode={invoice.taxMode}
            items={invoice.items}
            totals={invoice.totals}
            amountPaidPaise={invoice.amountPaidPaise}
            balancePaise={invoice.balancePaise}
            terms={invoice.terms}
            notes={invoice.notes}
            stamp={stamp}
          />
          {invoice.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {formatINR(p.amountPaise)} <span className="text-muted-foreground font-normal">· {p.methodLabel}</span>
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {p.paymentNumber} · {formatDate(p.paidAt)}
                        {p.transactionReference && ` · Ref ${p.transactionReference}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <EnumBadge value={p.status} labels={PAYMENT_STATUS_LABELS} tones={PAYMENT_STATUS_TONES} />
                      <PaymentRowActions
                        id={p.id}
                        paymentNumber={p.paymentNumber}
                        amountPaise={p.amountPaise}
                        voided={p.status === "voided"}
                        canVoid={hasPermission(user, "payments:void")}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">{formatINR(invoice.balancePaise)}</span>
                <span className="text-muted-foreground text-sm">balance due</span>
              </div>
              <Progress value={paidPercent} aria-label={`${paidPercent}% paid`} />
              <div className="text-muted-foreground flex justify-between text-sm">
                <span>Received {formatINR(invoice.amountPaidPaise)}</span>
                <span>of {formatINR(invoice.totalPaise)}</span>
              </div>
              {invoice.status === "overdue" && <StatusBadge tone="danger">Past due since {formatDate(invoice.dueDate)}</StatusBadge>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={1}
                items={[
                  { label: "Customer", value: <Link className="text-primary hover:underline" href={`/customers/${invoice.customerId}`}>{invoice.customerName}</Link> },
                  { label: "Tax treatment", value: TAX_MODE_LABELS[invoice.taxMode] },
                  { label: "Project", value: invoice.projectId ? <Link className="text-primary hover:underline" href={`/projects/${invoice.projectId}`}>{invoice.projectName}</Link> : null },
                  { label: "From quotation", value: invoice.quotationId ? <Link className="text-primary hover:underline" href={`/quotations/${invoice.quotationId}`}>View quotation</Link> : null },
                  { label: "Issued", value: invoice.issuedAt ? formatDateTime(invoice.issuedAt) : "Not yet issued" },
                  { label: "Last emailed", value: invoice.sentAt ? formatDateTime(invoice.sentAt) : null },
                  { label: "Created by", value: invoice.createdByName },
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

export default function InvoicePage(props: PageProps<"/invoices/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <InvoiceDetail params={props.params} />
    </Suspense>
  );
}
