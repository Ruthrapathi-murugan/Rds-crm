import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText, Plus } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { EnumBadge } from "@/components/common/status-badge";
import { DataCard } from "@/components/data-table/data-card";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { ListBody, ListView } from "@/components/data-table/list-view";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { TableSkeleton } from "@/components/data-table/table-skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import { optionsOf, QUOTATION_STATUS_LABELS, QUOTATION_STATUSES } from "@/lib/constants";
import { enumParam, parseListParams, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { QUOTATION_STATUS_TONES } from "@/lib/status-tones";
import { formatDate } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { listQuotations, QUOTATION_SORTS } from "@/services/quotation.service";

export const metadata: Metadata = { title: "Quotations" };

async function HeaderActions() {
  const user = await requireUser();
  if (!hasPermission(user, "quotations:write")) return null;
  return (
    <Button asChild>
      <Link href="/quotations/new">
        <Plus className="size-4" aria-hidden="true" /> New quotation
      </Link>
    </Button>
  );
}

async function QuotationsList({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "quotations:read")) return <AccessDenied />;
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: QUOTATION_SORTS, defaultSort: "issueDate" });
  const status = enumParam(sp, "status", QUOTATION_STATUSES);
  const result = await listQuotations(user, params, { status, customer: typeof sp.customer === "string" ? sp.customer : undefined });

  return (
    <ListView defaultSort="issueDate">
      <ListToolbar
        searchPlaceholder="Search number or customer…"
        filters={[{ key: "status", label: "Statuses", options: optionsOf(QUOTATION_STATUSES, QUOTATION_STATUS_LABELS) }]}
      />
      <ListBody>
        <DataCard>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={params.q || status ? "No quotations match your filters" : "No quotations yet"}
              description="Prepare a priced proposal for a customer, then convert it to an invoice once accepted."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableHeader field="quotationNumber">Quotation</SortableHeader>
                  <TableHead>Customer</TableHead>
                  <SortableHeader field="issueDate">Date</SortableHeader>
                  <SortableHeader field="validUntil" className="hidden md:table-cell">
                    Valid until
                  </SortableHeader>
                  <SortableHeader field="totals.totalPaise" align="right">
                    Total
                  </SortableHeader>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {result.rows.map((row) => (
                  <TableRow key={row.id} className="group">
                    <TableCell>
                      <Link href={`/quotations/${row.id}`} className="group-hover:text-primary font-medium transition-colors">
                        {row.quotationNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">
                      <Link href={`/customers/${row.customerId}`} className="hover:text-primary">
                        {row.customerName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.issueDate)}</TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">{formatDate(row.validUntil)}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">{formatINR(row.totalPaise)}</TableCell>
                    <TableCell>
                      <EnumBadge value={row.status} labels={QUOTATION_STATUS_LABELS} tones={QUOTATION_STATUS_TONES} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataCard>
      </ListBody>
      {result.total > 0 && (
        <ListPagination page={result.page} pageCount={result.pageCount} pageSize={result.pageSize} total={result.total} noun="quotations" />
      )}
    </ListView>
  );
}

export default function QuotationsPage(props: PageProps<"/quotations">) {
  return (
    <>
      <PageHeader
        title="Quotations"
        description="Proposals sent to customers, from draft to accepted."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton columns={6} />}>
        <QuotationsList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
