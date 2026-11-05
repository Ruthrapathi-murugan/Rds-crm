import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarCheck, IndianRupee, Wallet } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EnumBadge } from "@/components/common/status-badge";
import { DataCard } from "@/components/data-table/data-card";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { ListBody, ListView } from "@/components/data-table/list-view";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { CardsSkeleton, TableSkeleton } from "@/components/data-table/table-skeleton";
import { PaymentRowActions, RecordPaymentButton } from "@/components/finance/payment-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import { optionsOf, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, PAYMENT_STATUS_LABELS, PAYMENT_STATUSES } from "@/lib/constants";
import { enumParam, parseListParams, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { PAYMENT_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { invoiceSummary } from "@/services/invoice.service";
import { listPayments, PAYMENT_SORTS, paymentSummary } from "@/services/payment.service";

export const metadata: Metadata = { title: "Payments" };

async function HeaderActions() {
  const user = await requireUser();
  return hasPermission(user, "payments:write") ? <RecordPaymentButton /> : null;
}

async function Summary() {
  const user = await requireUser();
  if (!hasPermission(user, "payments:read")) return null;
  const [payments, invoices] = await Promise.all([paymentSummary(), invoiceSummary()]);
  return (
    <div className="stagger grid gap-4 sm:grid-cols-3">
      <StatCard label="Received this month" value={payments.thisMonth} format="inr" icon={CalendarCheck} accent="success" hint="Recorded payments, IST calendar month" />
      <StatCard label="Received all time" value={payments.total} format="inr" icon={IndianRupee} hint={`${payments.count} payments`} />
      <StatCard label="Outstanding receivables" value={invoices.outstanding} format="inr" icon={Wallet} accent="info" href="/invoices?status=sent" />
    </div>
  );
}

async function PaymentsList({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "payments:read")) return <AccessDenied />;
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: PAYMENT_SORTS, defaultSort: "paidAt" });
  const filters = {
    method: enumParam(sp, "method", PAYMENT_METHODS),
    status: enumParam(sp, "status", PAYMENT_STATUSES),
    customer: typeof sp.customer === "string" ? sp.customer : undefined,
  };
  const result = await listPayments(user, params, filters);
  const canVoid = hasPermission(user, "payments:void");

  return (
    <ListView defaultSort="paidAt">
      <ListToolbar
        searchPlaceholder="Search payment no., reference, customer, invoice…"
        filters={[
          { key: "method", label: "Methods", options: optionsOf(PAYMENT_METHODS, PAYMENT_METHOD_LABELS) },
          { key: "status", label: "Statuses", options: optionsOf(PAYMENT_STATUSES, PAYMENT_STATUS_LABELS) },
        ]}
      />
      <ListBody>
        <DataCard>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={IndianRupee}
              title={params.q || filters.method || filters.status ? "No payments match your filters" : "No payments recorded yet"}
              description="Payments recorded against invoices or as advances appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableHeader field="paymentNumber">Payment</SortableHeader>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Invoice</TableHead>
                  <SortableHeader field="paidAt">Date</SortableHeader>
                  <TableHead className="hidden lg:table-cell">Method</TableHead>
                  <SortableHeader field="amountPaise" align="right">
                    Amount
                  </SortableHeader>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {result.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="font-medium">{row.paymentNumber}</span>
                      {row.transactionReference && <span className="text-muted-foreground block text-xs">Ref {row.transactionReference}</span>}
                    </TableCell>
                    <TableCell className="max-w-52 truncate">
                      <Link href={`/customers/${row.customerId}`} className="hover:text-primary">
                        {row.customerName}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {row.invoiceId ? (
                        <Link href={`/invoices/${row.invoiceId}`} className="hover:text-primary">
                          {row.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Advance</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.paidAt)}</TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">{PAYMENT_METHOD_LABELS[row.method]}</TableCell>
                    <TableCell className={cn("text-right font-medium whitespace-nowrap", row.status === "voided" && "text-muted-foreground line-through")}>
                      {formatINR(row.amountPaise)}
                    </TableCell>
                    <TableCell>
                      <EnumBadge value={row.status} labels={PAYMENT_STATUS_LABELS} tones={PAYMENT_STATUS_TONES} />
                    </TableCell>
                    <TableCell>
                      <PaymentRowActions id={row.id} paymentNumber={row.paymentNumber} amountPaise={row.amountPaise} voided={row.status === "voided"} canVoid={canVoid} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataCard>
      </ListBody>
      {result.total > 0 && (
        <ListPagination page={result.page} pageCount={result.pageCount} pageSize={result.pageSize} total={result.total} noun="payments" />
      )}
    </ListView>
  );
}

export default function PaymentsPage(props: PageProps<"/payments">) {
  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received, with receipts. Voided payments stay on record."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<CardsSkeleton count={3} />}>
        <Summary />
      </Suspense>
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <PaymentsList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
