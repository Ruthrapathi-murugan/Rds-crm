import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FolderKanban } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { EnumBadge, StatusBadge } from "@/components/common/status-badge";
import { DataCard } from "@/components/data-table/data-card";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar, type ListFilter } from "@/components/data-table/list-toolbar";
import { ListBody, ListView } from "@/components/data-table/list-view";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { TableSkeleton } from "@/components/data-table/table-skeleton";
import { DueDate } from "@/components/projects/due-date";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProgressBar } from "@/components/projects/progress-bar";
import { ProjectBoard } from "@/components/projects/project-board";
import { ProjectRowActions } from "@/components/projects/project-row-actions";
import { ProjectStatusPills } from "@/components/projects/project-status-pills";
import { ProjectViewSwitch } from "@/components/projects/project-view-switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import {
  optionsOf,
  PRIORITIES,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
} from "@/lib/constants";
import { enumParam, firstParam, parseListParams, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { PRIORITY_TONES, PROJECT_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import {
  customerOption,
  listProjects,
  PROJECT_SORTS,
  projectBoard,
  projectStatusCounts,
} from "@/services/project.service";
import { userOptions } from "@/services/user.service";

export const metadata: Metadata = { title: "Projects" };

async function HeaderActions({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "projects:write")) return null;
  const sp = await searchParams;
  const autoOpen = firstParam(sp, "new") === "1";
  const customer = autoOpen ? await customerOption(firstParam(sp, "customer")) : null;
  // Remount when the URL asks for the sheet so it opens even if the button is already on screen.
  return <NewProjectButton key={autoOpen ? `new-${customer?.value ?? ""}` : "idle"} autoOpen={autoOpen} customer={customer} />;
}

async function ProjectsList({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "projects:read")) return <AccessDenied />;

  const sp = await searchParams;
  const view = firstParam(sp, "view") === "board" ? "board" : "list";
  const params = parseListParams(sp, { sortable: PROJECT_SORTS, defaultSort: "createdAt" });
  const filters = {
    status: view === "list" ? enumParam(sp, "status", PROJECT_STATUSES) : undefined,
    category: enumParam(sp, "category", SERVICE_CATEGORIES),
    priority: enumParam(sp, "priority", PRIORITIES),
    assignedTo: firstParam(sp, "assignedTo"),
    customer: firstParam(sp, "customer"),
    overdue: firstParam(sp, "overdue") === "1",
    archived: view === "list" && firstParam(sp, "archived") === "1",
  };
  const team = hasPermission(user, "records:all") ? await userOptions() : [];
  const now = new Date().toISOString();
  const canWrite = hasPermission(user, "projects:write");
  const canArchive = hasPermission(user, "projects:archive");
  const hasFilters = Boolean(
    params.q || filters.status || filters.category || filters.priority || filters.assignedTo || filters.customer || filters.overdue,
  );

  const toolbarFilters: ListFilter[] = [
    { key: "category", label: "Categories", options: optionsOf(SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS) },
    { key: "priority", label: "Priorities", options: optionsOf(PRIORITIES, PRIORITY_LABELS) },
    { key: "overdue", label: "Deadlines", options: [{ value: "1", label: "Overdue only" }] },
    {
      key: "assignedTo",
      label: "Assignees",
      options: [
        { value: "me", label: "Assigned to me" },
        ...(team.length ? [{ value: "unassigned", label: "Unassigned" }, ...team.map((u) => ({ value: u.value, label: u.label }))] : []),
      ],
    },
    ...(view === "list" ? [{ key: "archived", label: "Lists", options: [{ value: "1", label: "Archived projects" }] }] : []),
  ];

  if (view === "board") {
    const board = await projectBoard(user, params.q, filters);
    return (
      <ListView>
        <ListToolbar searchPlaceholder="Search project name or number…" filters={toolbarFilters}>
          <ProjectViewSwitch view="board" />
        </ListToolbar>
        <ListBody>
          <ProjectBoard board={board} now={now} canWrite={canWrite} />
        </ListBody>
      </ListView>
    );
  }

  const [result, counts] = await Promise.all([listProjects(user, params, filters), projectStatusCounts(user)]);

  return (
    <ListView defaultSort="createdAt">
      <ProjectStatusPills counts={counts} />
      <ListToolbar searchPlaceholder="Search project name or number…" filters={toolbarFilters}>
        <ProjectViewSwitch view="list" />
      </ListToolbar>
      <ListBody>
        <DataCard>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title={hasFilters ? "No projects match your filters" : filters.archived ? "No archived projects" : "No projects yet"}
              description={
                hasFilters
                  ? "Try a different search or clear the filters."
                  : "Create a project for a customer, or convert a won lead, to start tracking delivery."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableHeader field="name">Project</SortableHeader>
                  <TableHead className="hidden md:table-cell">Customer</TableHead>
                  <SortableHeader field="status">Status</SortableHeader>
                  <TableHead className="hidden xl:table-cell">Priority</TableHead>
                  <SortableHeader field="progress" className="min-w-32">
                    Progress
                  </SortableHeader>
                  <SortableHeader field="dueDate">Due</SortableHeader>
                  <TableHead className="hidden 2xl:table-cell">Assigned</TableHead>
                  <SortableHeader field="quotedAmountPaise" align="right" className="hidden sm:table-cell">
                    Quoted
                  </SortableHeader>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {result.rows.map((project) => (
                  <TableRow key={project.id} className={cn("group", project.overdue && "bg-destructive/[0.03]")}>
                    <TableCell className="max-w-72">
                      <Link href={`/projects/${project.id}`} className="flex flex-col gap-0.5 outline-none">
                        <span className="group-hover:text-primary truncate font-medium transition-colors">{project.name}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {project.projectNumber}
                          <span className="md:hidden"> · {project.customerName}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden max-w-48 md:table-cell">
                      <Link href={`/customers/${project.customerId}`} className="hover:text-primary block truncate transition-colors">
                        {project.customerName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col items-start gap-1">
                        <EnumBadge value={project.status} labels={PROJECT_STATUS_LABELS} tones={PROJECT_STATUS_TONES} />
                        <EnumBadge value={project.priority} labels={PRIORITY_LABELS} tones={PRIORITY_TONES} className="xl:hidden" />
                        {project.archived && <StatusBadge tone="muted">Archived</StatusBadge>}
                      </span>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <EnumBadge value={project.priority} labels={PRIORITY_LABELS} tones={PRIORITY_TONES} />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-28 items-center gap-2">
                        <ProgressBar value={project.progress} label={`${project.name} progress`} className="flex-1" />
                        <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">{project.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <DueDate
                        due={project.dueDate}
                        overdue={project.overdue}
                        now={now}
                        done={project.status === "completed" || project.status === "cancelled"}
                        className="flex-col items-start gap-0.5"
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden 2xl:table-cell">{project.assignedToName ?? "Unassigned"}</TableCell>
                    <TableCell className="hidden text-right font-medium whitespace-nowrap sm:table-cell">
                      {project.quotedAmountPaise ? formatINR(project.quotedAmountPaise) : "—"}
                    </TableCell>
                    <TableCell>
                      <ProjectRowActions
                        id={project.id}
                        name={project.name}
                        status={project.status}
                        archived={project.archived}
                        canWrite={canWrite}
                        canArchive={canArchive}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataCard>
      </ListBody>
      {result.total > 0 && (
        <ListPagination page={result.page} pageCount={result.pageCount} pageSize={result.pageSize} total={result.total} noun="projects" />
      )}
    </ListView>
  );
}

export default function ProjectsPage(props: PageProps<"/projects">) {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Track delivery, deadlines and money for every customer project."
        actions={
          <Suspense fallback={null}>
            <HeaderActions searchParams={props.searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <ProjectsList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
