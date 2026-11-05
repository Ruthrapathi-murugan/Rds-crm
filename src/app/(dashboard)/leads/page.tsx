import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UserPlus } from "lucide-react";
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
import { LeadRowActions } from "@/components/leads/lead-row-actions";
import { LeadStatusPills } from "@/components/leads/lead-status-pills";
import { NewLeadButton } from "@/components/leads/new-lead-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import { LEAD_SOURCE_LABELS, LEAD_SOURCES, LEAD_STATUS_LABELS, LEAD_STATUSES, optionsOf } from "@/lib/constants";
import { enumParam, parseListParams, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { LEAD_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { isPastDueDate, relativeDayLabel, formatTime } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { LEAD_SORTS, leadStatusCounts, listLeads } from "@/services/lead.service";
import { userOptions } from "@/services/user.service";

export const metadata: Metadata = { title: "Leads" };

async function HeaderActions() {
  const user = await requireUser();
  return hasPermission(user, "leads:write") ? <NewLeadButton /> : null;
}

async function LeadsList({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "leads:read")) return <AccessDenied />;

  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: LEAD_SORTS, defaultSort: "createdAt" });
  const filters = {
    status: enumParam(sp, "status", LEAD_STATUSES),
    source: enumParam(sp, "source", LEAD_SOURCES),
    assignedTo: typeof sp.assignedTo === "string" ? sp.assignedTo : undefined,
    followUp: enumParam(sp, "followUp", ["overdue", "today", "upcoming"] as const),
    archived: sp.archived === "1",
  };
  const [result, counts, team] = await Promise.all([
    listLeads(user, params, filters),
    leadStatusCounts(user),
    hasPermission(user, "records:all") ? userOptions() : Promise.resolve([]),
  ]);
  const now = new Date();
  const canArchive = hasPermission(user, "leads:archive");
  const hasFilters = Boolean(params.q || filters.status || filters.source || filters.assignedTo || filters.followUp);

  return (
    <ListView defaultSort="createdAt">
      <LeadStatusPills counts={counts} />
      <ListToolbar
        searchPlaceholder="Search name, business, phone, email…"
        filters={[
          { key: "source", label: "Sources", options: optionsOf(LEAD_SOURCES, LEAD_SOURCE_LABELS) },
          {
            key: "followUp",
            label: "Follow-ups",
            options: [
              { value: "overdue", label: "Overdue follow-ups" },
              { value: "today", label: "Due today" },
              { value: "upcoming", label: "Upcoming" },
            ],
          },
          ...(team.length
            ? [
                {
                  key: "assignedTo",
                  label: "Team members",
                  options: [
                    { value: "me", label: "Assigned to me" },
                    { value: "unassigned", label: "Unassigned" },
                    ...team.map((u) => ({ value: u.value, label: u.label })),
                  ],
                },
              ]
            : []),
          { key: "archived", label: "Lists", options: [{ value: "1", label: "Archived leads" }] },
        ]}
      />
      <ListBody>
        <DataCard>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={hasFilters ? "No leads match your filters" : filters.archived ? "No archived leads" : "No leads yet"}
              description={
                hasFilters
                  ? "Try a different search or clear the filters."
                  : "New enquiries from WhatsApp, calls, your website and walk-ins will appear here."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableHeader field="contactName">Lead</SortableHeader>
                  <TableHead>Contact</TableHead>
                  <TableHead className="hidden xl:table-cell">Interested in</TableHead>
                  <TableHead className="hidden lg:table-cell">Source</TableHead>
                  <SortableHeader field="status">Status</SortableHeader>
                  <SortableHeader field="estimatedValuePaise" align="right">
                    Value
                  </SortableHeader>
                  <SortableHeader field="nextFollowUpAt">Follow-up</SortableHeader>
                  <TableHead className="hidden lg:table-cell">Assigned</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {result.rows.map((lead) => {
                  const overdue =
                    lead.nextFollowUpAt &&
                    !["won", "lost"].includes(lead.status) &&
                    new Date(lead.nextFollowUpAt).getTime() < now.getTime();
                  return (
                    <TableRow key={lead.id} className="group">
                      <TableCell className="max-w-64">
                        <Link href={`/leads/${lead.id}`} className="flex flex-col gap-0.5 outline-none">
                          <span className="group-hover:text-primary truncate font-medium transition-colors">
                            {lead.contactName}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">
                            {lead.leadNumber}
                            {lead.businessName && ` · ${lead.businessName}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-sm">
                          <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="hover:text-primary whitespace-nowrap">
                            {lead.phone}
                          </a>
                          {lead.email && <span className="text-muted-foreground max-w-48 truncate text-xs">{lead.email}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-48 truncate xl:table-cell">
                        {lead.serviceName ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {LEAD_SOURCE_LABELS[lead.source]}
                      </TableCell>
                      <TableCell>
                        <EnumBadge value={lead.status} labels={LEAD_STATUS_LABELS} tones={LEAD_STATUS_TONES} />
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {lead.estimatedValuePaise ? formatINR(lead.estimatedValuePaise) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {lead.nextFollowUpAt ? (
                          <span className={cn("flex flex-col text-sm", overdue && "text-destructive")}>
                            <span className="font-medium">
                              {overdue && isPastDueDate(lead.nextFollowUpAt, now) ? "Overdue · " : ""}
                              {relativeDayLabel(lead.nextFollowUpAt, now)}
                            </span>
                            <span className={cn("text-xs", overdue ? "text-destructive/80" : "text-muted-foreground")}>
                              {formatTime(lead.nextFollowUpAt)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {lead.assignedToName ?? "Unassigned"}
                      </TableCell>
                      <TableCell>
                        <LeadRowActions id={lead.id} name={lead.contactName} archived={lead.archived} canArchive={canArchive} />
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
        <ListPagination page={result.page} pageCount={result.pageCount} pageSize={result.pageSize} total={result.total} noun="leads" />
      )}
    </ListView>
  );
}

export default function LeadsPage(props: PageProps<"/leads">) {
  return (
    <>
      <PageHeader
        title="Leads"
        description="Track enquiries from first contact to won business."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <LeadsList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
