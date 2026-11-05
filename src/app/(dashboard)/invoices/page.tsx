import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, FilePen, Plus, Receipt, Wallet } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import { INVOICE_STATUS_LABELS, INVOICE_STATUSES, optionsOf } from "@/lib/constants";
import { enumParam, parseListParams, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { INVOICE_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { INVOICE_SORTS, invoiceSummary, listInvoices } from "@/services/invoice.service";

export const metadata: Metadata = { title: "Invoices" };

async function HeaderActions() {
  const user = await requireUser();
  if (!hasPermission(user, "invoices:write")) return null;
  return (
    <Button asChild>
      <Link href="/invoices/new">
        <Plus className="size-4" aria-hidden="true" /> New invoice
      </Link>
    </Button>
  );
}

async function Summary() {
  const user = await requireUser();
  if (!hasPermission(user, "invoices:read")) return null;
  const s = await invoiceSummary();
  return (
    <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total invoiced" value={s.invoiced} format="inr" icon={Receipt} hint="Issued invoices, excluding cancelled" />
      <StatCard label="Outstanding" value={s.outstanding} format="inr" icon={Wallet} accent="info" href="/invoices?status=sent" hint="Balance still to be received" />
      <StatCard
        label="Overdue"
        value={s.overdue}
        format="inr"
        icon={AlertTriangle}
        accent="danger"
        href="/invoices?status=overdue"
        hint={`${s.overdueCount} invoice${s.overdueCount === 1 ? "" : "s"} past the due date`}
      />
      <StatCard label="Drafts" value={s.drafts} icon={FilePen} accent="warning" href="/invoices?status=draft" hint="Not yet issued" />
    </div>
  );
}

async function InvoicesList({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "invoices:read")) return <AccessDenied />;
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: INVOICE_SORTS, defaultSort: "issueDate" });
  const status = enumParam(sp, "status", INVOICE_STATUSES);
  const result = await listInvoices(user, params, { status, customer: typeof sp.customer === "string" ? sp.customer : undefined });

  return (
    <ListView defaultSort="issueDate">
      <ListToolbar
        searchPlaceholder="Search number, customer or GSTIN…"
        filters={[{ key: "status", label: "Statuses", options: optionsOf(INVOICE_STATUSES, INVOICE_STATUS_LABELS) }]}
      />
      <ListBody>
        <DataCard>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={params.q || status ? "No invoices match your filters" : "No invoices yet"}
              description="Create an invoice directly, or convert an accepted quotation."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableHeader field="invoiceNumber">Invoice</SortableHeader>
                  <TableHead>Customer</TableHead>
                  <SortableHeader field="issueDate" className="hidden md:table-cell">
                    Date
                  </SortableHeader>
                  <SortableHeader field="dueDate">Due</SortableHeader>
                  <SortableHeader field="totals.totalPaise" align="right">
                    Total
                  </SortableHeader>
                  <SortableHeader field="balancePaise" align="right" className="hidden sm:table-cell">
                    Balance
                  </SortableHeader>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {result.rows.map((row) => (
                  <TableRow key={row.id} className="group">
                    <TableCell>
                      <Link href={`/invoices/${row.id}`} className="group-hover:text-primary font-medium transition-colors">
                        {row.invoiceNumber ?? <span className="text-muted-foreground italic">Draft</span>}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">
                      <Link href={`/customers/${row.customerId}`} className="hover:text-primary">
                        {row.customerName}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">{formatDate(row.issueDate)}</TableCell>
                    <TableCell className={cn("whitespace-nowrap", row.status === "overdue" && "text-destructive font-medium")}>
                      {formatDate(row.dueDate)}
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">{formatINR(row.totalPaise)}</TableCell>
                    <TableCell className="hidden text-right whitespace-nowrap sm:table-cell">
                      {row.storedStatus === "cancelled" || row.storedStatus === "draft" ? "—" : formatINR(row.balancePaise)}
                    </TableCell>
                    <TableCell>
                      <EnumBadge value={row.status} labels={INVOICE_STATUS_LABELS} tones={INVOICE_STATUS_TONES} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataCard>
      </ListBody>
      {result.total > 0 && (
        <ListPagination page={result.page} pageCount={result.pageCount} pageSize={result.pageSize} total={result.total} noun="invoices" />
      )}
    </ListView>
  );
}

export default function InvoicesPage(props: PageProps<"/invoices">) {
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Bill customers, track what is due and what has been paid."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<CardsSkeleton />}>
        <Summary />
      </Suspense>
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <InvoicesList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
