import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, CalendarCheck2, CalendarDays, CircleCheckBig, ListChecks } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { DetailList } from "@/components/common/detail-list";
import { PageHeader } from "@/components/common/page-header";
import { EnumBadge, StatusBadge } from "@/components/common/status-badge";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { DueDate } from "@/components/projects/due-date";
import { ProgressBar } from "@/components/projects/progress-bar";
import { ProjectChecklist } from "@/components/projects/project-checklist";
import { ProjectDetailActions } from "@/components/projects/project-detail-actions";
import { ProjectProgress } from "@/components/projects/project-progress";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS, SERVICE_CATEGORY_LABELS } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { PRIORITY_TONES, PROJECT_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { dateInputOrEmpty, formatDate } from "@/lib/utils/date";
import { formatINR, paiseToInput } from "@/lib/utils/money";
import { listEntityActivity } from "@/services/activity.service";
import { getProject } from "@/services/project.service";

export const metadata: Metadata = { title: "Project" };

async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "projects:read")) return <AccessDenied />;
  const { id } = await params;
  const project = await getProject(user, id);
  if (!project) notFound();
  const activity = await listEntityActivity("project", project.id, 40);
  const now = new Date().toISOString();
  const canWrite = hasPermission(user, "projects:write");
  const editable = canWrite && !project.archived;
  const closed = project.status === "completed" || project.status === "cancelled";
  const f = project.financials;
  const receivedShare = f && f.quotedPaise > 0 ? Math.min(100, (f.receivedPaise / f.quotedPaise) * 100) : 0;

  return (
    <>
      <PageHeader
        back={{ href: "/projects", label: "Projects" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name}
            <EnumBadge value={project.status} labels={PROJECT_STATUS_LABELS} tones={PROJECT_STATUS_TONES} />
            <EnumBadge value={project.priority} labels={PRIORITY_LABELS} tones={PRIORITY_TONES} />
            {project.archived && <StatusBadge tone="muted">Archived</StatusBadge>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span>{project.projectNumber}</span>
            <span aria-hidden="true">·</span>
            <Link href={`/customers/${project.customerId}`} className="text-foreground hover:text-primary font-medium underline-offset-4 hover:underline">
              {project.customerName}
            </Link>
            <span aria-hidden="true">·</span>
            <span>{SERVICE_CATEGORY_LABELS[project.category]}</span>
          </span>
        }
        actions={
          <ProjectDetailActions
            project={{ id: project.id, name: project.name, status: project.status, archived: project.archived }}
            customerOption={{ value: project.customerId, label: project.customerName }}
            formValues={{
              name: project.name,
              customer: project.customerId,
              service: project.serviceId ?? "",
              category: project.category,
              description: project.description,
              startDate: dateInputOrEmpty(project.startDate),
              dueDate: dateInputOrEmpty(project.dueDate),
              quotedAmount: paiseToInput(project.quotedAmountPaise),
              advanceAmount: paiseToInput(project.advanceAmountPaise),
              assignedTo: project.assignedToId ?? "",
              priority: project.priority,
              status: project.status,
              progress: String(project.progress),
              internalNotes: project.internalNotes,
            }}
            permissions={{ write: canWrite, archive: hasPermission(user, "projects:archive") }}
          />
        }
      />

      {project.overdue && (
        <div
          role="status"
          className="animate-fade-up border-destructive/30 bg-destructive/5 text-destructive flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm"
        >
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Overdue.</strong> This project was due on {formatDate(project.dueDate!)} and is still{" "}
            {PROJECT_STATUS_LABELS[project.status].toLowerCase()}.
          </span>
        </div>
      )}

      <div className="stagger grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <ProjectProgress
              projectId={project.id}
              progress={project.progress}
              editable={editable && !closed}
              lockedReason={
                project.archived
                  ? "Restore the project to update progress."
                  : project.status === "completed"
                    ? `Completed${project.completedAt ? ` on ${formatDate(project.completedAt)}` : ""}.`
                    : project.status === "cancelled"
                      ? "This project was cancelled."
                      : undefined
              }
            />
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4 md:grid-cols-2 md:border-l md:pl-8">
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                  <CalendarDays className="size-3.5" aria-hidden="true" /> Start
                </dt>
                <dd>{project.startDate ? formatDate(project.startDate) : <span className="text-muted-foreground">Not set</span>}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                  <CalendarCheck2 className="size-3.5" aria-hidden="true" /> Due
                </dt>
                <dd>
                  <DueDate due={project.dueDate} overdue={project.overdue} now={now} done={closed} />
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                  <ListChecks className="size-3.5" aria-hidden="true" /> Checklist
                </dt>
                <dd className="tabular-nums">
                  {project.checklistDone}/{project.checklistTotal} done
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                  <CircleCheckBig className="size-3.5" aria-hidden="true" /> Completed
                </dt>
                <dd>{project.completedAt ? formatDate(project.completedAt) : <span className="text-muted-foreground">—</span>}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  {
                    label: "Customer",
                    value: (
                      <Link href={`/customers/${project.customerId}`} className="hover:text-primary font-medium transition-colors">
                        {project.customerName}
                      </Link>
                    ),
                  },
                  { label: "Service", value: project.serviceName },
                  { label: "Category", value: SERVICE_CATEGORY_LABELS[project.category] },
                  { label: "Assigned to", value: project.assignedToName ?? "Unassigned" },
                  { label: "Created by", value: project.createdByName },
                  {
                    label: "Source lead",
                    value: project.sourceLeadId ? (
                      <Link href={`/leads/${project.sourceLeadId}`} className="hover:text-primary transition-colors">
                        View lead
                      </Link>
                    ) : null,
                  },
                  { label: "Scope / description", value: project.description, wide: true },
                  { label: "Internal notes", value: project.internalNotes, wide: true },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
              <CardDescription>Delivery steps for this project.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProjectChecklist projectId={project.id} items={project.checklist} editable={editable} />
            </CardContent>
          </Card>
          <RelatedTasks project={project.id} />
        </div>

        <div className="flex flex-col gap-6">
          {f && (
          <Card>
            <CardHeader>
              <CardTitle>Financial summary</CardTitle>
              <CardDescription>Received counts recorded payments against this project.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-2.5 text-sm">
                {[
                  { label: "Quoted", value: f.quotedPaise, strong: true },
                  { label: "Advance agreed", value: f.advanceAgreedPaise },
                  { label: "Invoiced", value: f.invoicedPaise },
                  { label: "Received", value: f.receivedPaise, tone: "text-emerald-700" },
                ].map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className={cn("tabular-nums", row.strong && "font-semibold", row.tone)}>{formatINR(row.value)}</dd>
                  </div>
                ))}
              </dl>
              {f.quotedPaise > 0 && (
                <div className="flex flex-col gap-1.5">
                  <ProgressBar value={receivedShare} size="md" tone="success" label="Share of quote received" />
                  <p className="text-muted-foreground text-xs tabular-nums">{Math.round(receivedShare)}% of the quote received</p>
                </div>
              )}
              <div className="bg-muted/50 flex items-baseline justify-between gap-3 rounded-lg px-3 py-2.5">
                <span className="text-sm font-medium">Remaining</span>
                <span className={cn("text-lg font-semibold tabular-nums", f.remainingPaise > 0 ? "text-foreground" : "text-emerald-700")}>
                  {formatINR(f.remainingPaise)}
                </span>
              </div>
            </CardContent>
          </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Status updates &amp; activity</CardTitle>
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

export default function ProjectPage(props: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ProjectDetail params={props.params} />
    </Suspense>
  );
}
