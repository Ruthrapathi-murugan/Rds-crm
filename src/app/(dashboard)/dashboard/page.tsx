import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderKanban,
  IndianRupee,
  Plus,
  Receipt,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EnumBadge, StatusBadge } from "@/components/common/status-badge";
import { BarList, ColumnChart, ORDINAL_BLUE } from "@/components/charts/charts";
import { CardsSkeleton } from "@/components/data-table/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/current-user";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, PRIORITY_LABELS, type Priority } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { LEAD_STATUS_TONES, PRIORITY_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, relativeDayLabel } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { dashboardData } from "@/services/report.service";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(now: Date) {
  const hour = Number(format(now, "H", { in: tz("Asia/Kolkata") }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

async function Header() {
  const user = await requireUser();
  const now = new Date();
  return (
    <PageHeader
      title={
        <span className="flex items-center gap-2">
          {greeting(now)}, {user.name.split(" ")[0]}
          <Sparkles className="text-primary animate-pop size-5" aria-hidden="true" />
        </span>
      }
      description={`Here's how Ruthra Digital Solutions is doing today · ${formatDate(now)}`}
      actions={
        <>
          {hasPermission(user, "leads:write") && (
            <Button asChild variant="outline">
              <Link href="/leads">
                <UserPlus className="size-4" aria-hidden="true" /> Leads
              </Link>
            </Button>
          )}
          {hasPermission(user, "invoices:write") && (
            <Button asChild>
              <Link href="/invoices/new">
                <Plus className="size-4" aria-hidden="true" /> New invoice
              </Link>
            </Button>
          )}
        </>
      }
    />
  );
}

async function DashboardBody() {
  const user = await requireUser();
  const data = await dashboardData(user);
  const { kpis, access } = data;
  const now = new Date();
  const maxFunnel = Math.max(1, ...data.funnel.statuses.map((s) => s.count));

  return (
    <>
      <section aria-label="Key figures" className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Total leads" value={kpis.totalLeads} icon={Users} href="/leads" hint="Active, not archived" />
        <StatCard label="New leads this month" value={kpis.newLeadsThisMonth} icon={UserPlus} accent="info" href="/leads?sort=createdAt&dir=desc" />
        {access.customers && <StatCard label="Customers" value={kpis.totalCustomers} icon={BriefcaseBusiness} accent="success" href="/customers" />}
        {access.projects && <StatCard label="Active projects" value={kpis.activeProjects} icon={FolderKanban} accent="warning" href="/projects" />}
        {access.projects && <StatCard label="Completed projects" value={kpis.completedProjects} icon={CheckCircle2} accent="success" href="/projects?status=completed" />}
        {access.quotations && <StatCard label="Pending quotations" value={kpis.pendingQuotations} icon={FileText} href="/quotations?status=sent" hint="Draft or sent, still valid" />}
      </section>

      {(access.finance || access.payments) && (
        <section aria-label="Money" className="stagger grid gap-4 sm:grid-cols-3">
          {access.finance && <StatCard label="Total invoiced" value={kpis.invoicedPaise} format="inr" icon={Receipt} href="/invoices" hint="All issued invoices" />}
          {access.payments && <StatCard label="Payments received" value={kpis.receivedPaise} format="inr" icon={IndianRupee} accent="success" href="/payments" hint="All recorded payments" />}
          {access.finance && (
            <StatCard
              label="Outstanding"
              value={kpis.outstandingPaise}
              format="inr"
              icon={Wallet}
              accent={kpis.overduePaise > 0 ? "danger" : "info"}
              href="/invoices?status=overdue"
              hint={kpis.overduePaise > 0 ? `${formatINR(kpis.overduePaise)} overdue on ${kpis.overdueCount} invoice${kpis.overdueCount === 1 ? "" : "s"}` : "Nothing overdue"}
            />
          )}
        </section>
      )}

      <section className="stagger grid gap-6 xl:grid-cols-3">
        {access.payments ? (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Monthly revenue</CardTitle>
              <CardDescription>Payments received per month, last 12 months (India time)</CardDescription>
            </CardHeader>
            <CardContent>
              {data.revenue.some((m) => m.receivedPaise > 0) ? (
                <ColumnChart
                  seriesLabel="Received"
                  data={data.revenue.map((m) => ({
                    label: m.label.split(" ")[0],
                    value: m.receivedPaise,
                    note: `${m.label} · ${m.payments} payment${m.payments === 1 ? "" : "s"} · invoiced ${formatINR(m.invoicedPaise)}`,
                  }))}
                />
              ) : (
                <EmptyState icon={IndianRupee} title="No payments yet" description="Revenue appears here as payments are recorded." />
              )}
            </CardContent>
          </Card>
        ) : null}
        <Card className={cn(!access.payments && "xl:col-span-3")}>
          <CardHeader>
            <CardTitle>Lead conversion</CardTitle>
            <CardDescription>
              {data.funnel.total > 0
                ? `${data.funnel.conversionRate.toFixed(1)}% of ${data.funnel.total} leads won · ${data.funnel.closedRate.toFixed(0)}% win rate on closed leads`
                : "No leads yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.funnel.total > 0 ? (
              <BarList
                seriesLabel="Leads"
                colors={ORDINAL_BLUE}
                data={data.funnel.statuses.map((s) => ({ label: LEAD_STATUS_LABELS[s.status], value: s.count, share: Math.round((s.count / maxFunnel) * 100) }))}
              />
            ) : (
              <EmptyState icon={UserPlus} title="No leads yet" description="Add enquiries to see your pipeline." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="stagger grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" aria-hidden="true" /> Your tasks & follow-ups
            </CardTitle>
            <CardDescription>Due in the next 7 days, including overdue</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {data.upcomingTasks.length === 0 && data.followUps.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Nothing due — you&apos;re all caught up.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {data.upcomingTasks.map((t) => (
                  <li key={t.id}>
                    <Link href={t.href} className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{t.title}</span>
                        <span className={cn("text-xs", t.overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                          {t.overdue ? "Overdue · " : ""}
                          {relativeDayLabel(t.dueAt, now)}, {formatTime(t.dueAt)}
                        </span>
                      </span>
                      <StatusBadge tone={PRIORITY_TONES[t.priority as Priority]}>{PRIORITY_LABELS[t.priority as Priority]}</StatusBadge>
                    </Link>
                  </li>
                ))}
                {data.followUps.map((f) => (
                  <li key={f.id}>
                    <Link href={`/leads/${f.id}`} className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">Follow up: {f.name}</span>
                        <span className={cn("text-xs", f.overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                          {f.overdue ? "Overdue · " : ""}
                          {relativeDayLabel(f.at, now)}, {formatTime(f.at)}
                          {f.business && ` · ${f.business}`}
                        </span>
                      </span>
                      <StatusBadge tone="primary">Lead</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {access.finance && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4" aria-hidden="true" /> Overdue payments
              </CardTitle>
              <CardDescription>Invoices past their due date</CardDescription>
            </CardHeader>
            <CardContent>
              {data.overdueInvoices.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">No overdue invoices.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {data.overdueInvoices.map((i) => (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">{i.customer}</span>
                          <span className="text-destructive text-xs">
                            {i.invoiceNumber} · {i.daysOverdue} day{i.daysOverdue === 1 ? "" : "s"} overdue
                          </span>
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{formatINR(i.balancePaise)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-4" aria-hidden="true" /> Recent enquiries
            </CardTitle>
            <CardDescription>Newest leads</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentLeads.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">No enquiries yet.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {data.recentLeads.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{l.name}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {LEAD_SOURCE_LABELS[l.source]} · {relativeDayLabel(l.createdAt, now)}
                          {l.valuePaise ? ` · ${formatINR(l.valuePaise)}` : ""}
                        </span>
                      </span>
                      <EnumBadge value={l.status} labels={LEAD_STATUS_LABELS} tones={LEAD_STATUS_TONES} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {access.projects && (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="size-4" aria-hidden="true" /> Recent project activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline entries={data.projectActivity} emptyText="No project activity yet." />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function BodySkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <CardsSkeleton count={6} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-80 xl:col-span-2" />
        <Skeleton className="h-80" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <Suspense fallback={<Skeleton className="h-14 w-80" />}>
        <Header />
      </Suspense>
      <Suspense fallback={<BodySkeleton />}>
        <DashboardBody />
      </Suspense>
    </>
  );
}
