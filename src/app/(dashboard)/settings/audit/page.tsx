import type { Metadata } from "next";
import { Suspense } from "react";
import { ScrollText, ShieldCheck } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { DataCard } from "@/components/data-table/data-card";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { ListBody, ListView } from "@/components/data-table/list-view";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { TableSkeleton } from "@/components/data-table/table-skeleton";
import { AuditFilters } from "@/components/settings/audit-filters";
import { SettingsNav, SettingsNavSkeleton } from "@/components/settings/settings-nav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import { firstParam, parseListParams, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/date";
import { AUDIT_EVENT_GROUPS, listAuditLog } from "@/services/activity.service";
import { listUsers } from "@/services/user.service";

export const metadata: Metadata = { title: "Audit log" };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ENTITY_LABELS: Record<string, string> = {
  user: "User",
  lead: "Lead",
  customer: "Customer",
  service: "Service",
  project: "Project",
  task: "Task",
  quotation: "Quotation",
  invoice: "Invoice",
  payment: "Payment",
  settings: "Settings",
  auth: "Account",
};

function dayParam(sp: SearchParamsRecord, key: string) {
  const value = firstParam(sp, key);
  return value && DAY_PATTERN.test(value) ? value : undefined;
}

async function AuditList({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "audit:read")) return <AccessDenied />;

  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultPageSize: 50 });
  const groups = AUDIT_EVENT_GROUPS.map((g) => g.value) as readonly string[];
  const actionParam = firstParam(sp, "action");
  const filters = {
    actor: firstParam(sp, "actor"),
    action: actionParam && groups.includes(actionParam) ? actionParam : undefined,
    from: dayParam(sp, "from"),
    to: dayParam(sp, "to"),
    sensitiveOnly: firstParam(sp, "all") !== "1",
  };
  const [result, users] = await Promise.all([listAuditLog(params, filters), listUsers()]);
  const hasFilters = Boolean(params.q || filters.actor || filters.action || filters.from || filters.to);

  return (
    <ListView defaultSort="createdAt">
      <ListToolbar
        searchPlaceholder="Search message, record, IP…"
        filters={[
          {
            key: "actor",
            label: "Team members",
            options: users.map((u) => ({ value: u.id, label: u.isActive ? u.name : `${u.name} (inactive)` })),
          },
          {
            key: "action",
            label: "Events",
            options: AUDIT_EVENT_GROUPS.map((g) => ({ value: g.value, label: `${g.label} (${g.value}.*)` })),
          },
        ]}
      />
      <AuditFilters />
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        {filters.sensitiveOnly
          ? "Showing security, permission and money events. Times are in IST. Entries cannot be edited or deleted."
          : "Showing all activity. Times are in IST. Entries cannot be edited or deleted."}
      </p>
      <ListBody>
        <DataCard>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title={hasFilters ? "No events match your filters" : "No audit events yet"}
              description={
                hasFilters
                  ? "Try a different search, date range or event type."
                  : "Sign-ins, user changes, settings updates and financial actions will be recorded here."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableHeader field="createdAt">Time (IST)</SortableHeader>
                  <TableHead>User</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="hidden lg:table-cell">Record</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="hidden md:table-cell">IP address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {result.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground align-top whitespace-nowrap tabular-nums">
                      <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                    </TableCell>
                    <TableCell className="align-top font-medium whitespace-nowrap">{row.actorName}</TableCell>
                    <TableCell className="align-top">
                      <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs whitespace-nowrap">{row.action}</code>
                    </TableCell>
                    <TableCell className="hidden max-w-56 align-top lg:table-cell">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground text-xs">{ENTITY_LABELS[row.entityType] ?? row.entityType}</span>
                        {row.entityLabel && <span className="truncate">{row.entityLabel}</span>}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-md min-w-56 align-top whitespace-normal">{row.message}</TableCell>
                    <TableCell className="text-muted-foreground hidden align-top font-mono text-xs whitespace-nowrap md:table-cell">
                      {row.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataCard>
      </ListBody>
      {result.total > 0 && (
        <ListPagination page={result.page} pageCount={result.pageCount} pageSize={result.pageSize} total={result.total} noun="events" />
      )}
    </ListView>
  );
}

export default function AuditLogPage(props: PageProps<"/settings/audit">) {
  return (
    <>
      <PageHeader title="Audit log" description="A read-only record of sign-ins, permission changes, settings and money events.">
        <Suspense fallback={<SettingsNavSkeleton />}>
          <SettingsNav active="audit" />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<TableSkeleton columns={6} />}>
        <AuditList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
