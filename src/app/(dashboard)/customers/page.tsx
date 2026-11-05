import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BriefcaseBusiness } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { EnumBadge, StatusBadge } from "@/components/common/status-badge";
import { CustomerRowActions } from "@/components/customers/customer-row-actions";
import { NewCustomerButton } from "@/components/customers/new-customer-button";
import { DataCard } from "@/components/data-table/data-card";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { ListBody, ListView } from "@/components/data-table/list-view";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { TableSkeleton } from "@/components/data-table/table-skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  optionsOf,
} from "@/lib/constants";
import { enumParam, parseListParams, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { CUSTOMER_STATUS_TONES } from "@/lib/status-tones";
import { formatDate } from "@/lib/utils/date";
import { CUSTOMER_SORTS, listCustomers } from "@/services/customer.service";

export const metadata: Metadata = { title: "Customers" };

async function HeaderActions() {
  const user = await requireUser();
  return hasPermission(user, "customers:write") ? <NewCustomerButton /> : null;
}

async function CustomersList({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "customers:read")) return <AccessDenied />;

  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: CUSTOMER_SORTS, defaultSort: "createdAt" });
  const filters = {
    type: enumParam(sp, "type", CUSTOMER_TYPES),
    status: enumParam(sp, "status", CUSTOMER_STATUSES),
    archived: sp.archived === "1",
  };
  const result = await listCustomers(user, params, filters);
  const canArchive = hasPermission(user, "customers:archive");
  const hasFilters = Boolean(params.q || filters.type || filters.status);

  return (
    <ListView defaultSort="createdAt">
      <ListToolbar
        searchPlaceholder="Search name, business, phone, city…"
        filters={[
          { key: "type", label: "Types", options: optionsOf(CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS) },
          { key: "status", label: "Statuses", options: optionsOf(CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS) },
          { key: "archived", label: "Lists", options: [{ value: "1", label: "Archived customers" }] },
        ]}
      />
      <ListBody>
        <DataCard>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={BriefcaseBusiness}
              title={hasFilters ? "No customers match your filters" : filters.archived ? "No archived customers" : "No customers yet"}
              description={
                hasFilters
                  ? "Try a different search or clear the filters."
                  : filters.archived
                    ? "Customers you archive are kept here with their full history."
                    : "Convert a won lead or add a customer directly to start tracking projects and invoices."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableHeader field="businessName">Customer</SortableHeader>
                  <TableHead>Contact</TableHead>
                  <TableHead className="hidden lg:table-cell">Type</TableHead>
                  <SortableHeader field="city" className="hidden md:table-cell">
                    City
                  </SortableHeader>
                  <SortableHeader field="status">Status</SortableHeader>
                  <TableHead className="hidden text-right xl:table-cell">Services</TableHead>
                  <SortableHeader field="createdAt" className="hidden md:table-cell">
                    Added
                  </SortableHeader>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {result.rows.map((customer) => {
                  const title = customer.businessName || customer.name;
                  return (
                    <TableRow key={customer.id} className="group">
                      <TableCell className="max-w-72">
                        <Link href={`/customers/${customer.id}`} className="flex flex-col gap-0.5 outline-none">
                          <span className="group-hover:text-primary flex items-center gap-2 truncate font-medium transition-colors">
                            <span className="truncate">{title}</span>
                            {customer.archived && <StatusBadge tone="muted">Archived</StatusBadge>}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">
                            {customer.customerNumber}
                            {customer.businessName && ` · ${customer.name}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-sm">
                          <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="hover:text-primary whitespace-nowrap">
                            {customer.phone}
                          </a>
                          {customer.email && (
                            <span className="text-muted-foreground max-w-48 truncate text-xs">{customer.email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {CUSTOMER_TYPE_LABELS[customer.type]}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-40 truncate md:table-cell">
                        {customer.city || "—"}
                      </TableCell>
                      <TableCell>
                        <EnumBadge value={customer.status} labels={CUSTOMER_STATUS_LABELS} tones={CUSTOMER_STATUS_TONES} />
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums xl:table-cell">
                        {customer.servicesCount || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                        {formatDate(customer.createdAt)}
                      </TableCell>
                      <TableCell>
                        <CustomerRowActions id={customer.id} name={title} archived={customer.archived} canArchive={canArchive} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DataCard>
      </ListBody>
      {result.total > 0 && (
        <ListPagination page={result.page} pageCount={result.pageCount} pageSize={result.pageSize} total={result.total} noun="customers" />
      )}
    </ListView>
  );
}

export default function CustomersPage(props: PageProps<"/customers">) {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you work for, with their projects, documents and payments."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <CustomersList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
