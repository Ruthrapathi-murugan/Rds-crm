import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BadgePercent, CalendarCheck, Download, Info, Receipt, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EnumBadge } from "@/components/common/status-badge";
import { BarList, ColumnChart } from "@/components/charts/charts";
import { DataCard } from "@/components/data-table/data-card";
import { CardsSkeleton } from "@/components/data-table/table-skeleton";
import { RangePicker } from "@/components/reports/range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/current-user";
import {
  LEAD_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  PROJECT_STATUS_LABELS,
  SERVICE_CATEGORY_LABELS,
  type ServiceCategory,
} from "@/lib/constants";
import { firstParam, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { resolveReportRange } from "@/lib/report-range";
import { PROJECT_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import {
  customerActivityReport,
  FINANCIAL_DEFINITIONS,
  financialTotals,
  leadSourcesReport,
  leadStatusFunnel,
  monthlyRevenue,
  paymentsByMethod,
  projectStatusReport,
  receivablesAging,
  revenueByServiceCategory,
} from "@/services/report.service";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  { value: "revenue", label: "Revenue" },
  { value: "receivables", label: "Receivables" },
  { value: "sales", label: "Sales & leads" },
  { value: "projects", label: "Projects" },
  { value: "customers", label: "Customers" },
] as const;
type Tab = (typeof TABS)[number]["value"];

type Range = ReturnType<typeof resolveReportRange>;

function exportHref(report: string, range: Range) {
  return `/api/reports/export?report=${report}&from=${range.fromInput}&to=${range.toInput}`;
}

function ExportButton({ report, range, label = "Export CSV" }: { report: string; range: Range; label?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={exportHref(report, range)} download>
        <Download className="size-4" aria-hidden="true" /> {label}
      </a>
    </Button>
  );
}

function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <CardHeader className="flex flex-row items-start justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      {action}
    </CardHeader>
  );
}

async function RevenueTab({ range }: { range: Range }) {
  const [months, totals, methods, services] = await Promise.all([
    monthlyRevenue(range),
    financialTotals(range),
    paymentsByMethod(range),
    revenueByServiceCategory(range),
  ]);
  const methodTotal = methods.reduce((t, m) => t + m.totalPaise, 0);
  return (
    <div className="stagger flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Payments received" value={totals.receivedPaise} format="inr" icon={Wallet} accent="success" hint={`${totals.paymentCount} payments in this period`} />
        <StatCard label="Invoiced" value={totals.invoicedPaise} format="inr" icon={Receipt} hint="Invoices issued in this period" />
        <StatCard
          label="Collection ratio"
          value={totals.invoicedPaise ? (totals.receivedPaise / totals.invoicedPaise) * 100 : 0}
          format="percent"
          icon={BadgePercent}
          accent="info"
          hint="Received ÷ invoiced for this period"
        />
      </div>
      <Card>
        <SectionHeader title="Monthly revenue" description="Payments received per month (cash basis)" action={<ExportButton report="revenue" range={range} />} />
        <CardContent className="flex flex-col gap-6">
          <ColumnChart
            seriesLabel="Received"
            data={months.map((m) => ({ label: m.label, value: m.receivedPaise, note: `${m.payments} payments · invoiced ${formatINR(m.invoicedPaise)}` }))}
          />
          <DataCard className="shadow-none">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{m.label}</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(m.receivedPaise)}</TableCell>
                    <TableCell className="text-muted-foreground text-right">{m.payments}</TableCell>
                    <TableCell className="text-right">{formatINR(m.invoicedPaise)}</TableCell>
                    <TableCell className="text-muted-foreground text-right">{m.invoices}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(totals.receivedPaise)}</TableCell>
                  <TableCell className="text-right">{totals.paymentCount}</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(totals.invoicedPaise)}</TableCell>
                  <TableCell className="text-right">{months.reduce((t, m) => t + m.invoices, 0)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </DataCard>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Payments by method" action={<ExportButton report="payments" range={range} label="Payments CSV" />} />
          <CardContent>
            {methodTotal === 0 ? (
              <EmptyState icon={Wallet} title="No payments in this period" />
            ) : (
              <BarList
                format="inr"
                seriesLabel="Received"
                data={methods.filter((m) => m.totalPaise > 0).map((m) => ({ label: PAYMENT_METHOD_LABELS[m.method], value: m.totalPaise, note: `${m.count} payment${m.count === 1 ? "" : "s"}` }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <SectionHeader title="Revenue by service category" description="Taxable value of issued invoice lines" action={<ExportButton report="services" range={range} />} />
          <CardContent>
            {services.every((s) => s.taxablePaise === 0) ? (
              <EmptyState icon={Receipt} title="No invoiced services in this period" />
            ) : (
              <BarList
                format="inr"
                seriesLabel="Taxable value"
                data={services
                  .filter((s) => s.taxablePaise > 0)
                  .map((s) => ({
                    label: s.category === "uncategorised" ? "Other / custom" : SERVICE_CATEGORY_LABELS[s.category as ServiceCategory],
                    value: s.taxablePaise,
                    note: `${s.lines} invoice line${s.lines === 1 ? "" : "s"}`,
                  }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function ReceivablesTab({ range }: { range: Range }) {
  const { buckets, rows } = await receivablesAging();
  const total = buckets.reduce((t, b) => t + b.totalPaise, 0);
  return (
    <div className="stagger flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {buckets.map((b, i) => (
          <Card key={b.key} className={cn("gap-1 p-4", i > 0 && b.totalPaise > 0 && "border-red-200 dark:border-red-500/40")}>
            <p className="text-muted-foreground text-xs font-medium">{b.label}</p>
            <p className={cn("text-xl font-semibold tabular-nums", i > 0 && b.totalPaise > 0 && "text-destructive")}>{formatINR(b.totalPaise)}</p>
            <p className="text-muted-foreground text-xs">
              {b.count} invoice{b.count === 1 ? "" : "s"}
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <SectionHeader title="Outstanding invoices" description={`${formatINR(total)} still to be received, as of today`} action={<ExportButton report="receivables" range={range} />} />
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing outstanding" description="Every issued invoice is fully paid." />
          ) : (
            <DataCard className="shadow-none">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Ageing</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/invoices/${r.id}`} className="text-primary font-medium hover:underline">
                          {r.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{r.customerName}</TableCell>
                      <TableCell className={cn("whitespace-nowrap", r.daysOverdue > 0 && "text-destructive")}>{formatDate(r.dueDate)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.daysOverdue > 0 ? `${r.daysOverdue} days overdue` : "Not yet due"}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(r.balancePaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataCard>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function SalesTab({ range }: { range: Range }) {
  const user = await requireUser();
  const [sources, funnel] = await Promise.all([leadSourcesReport(user, range), leadStatusFunnel(user, range)]);
  const active = sources.filter((s) => s.total > 0);
  return (
    <div className="stagger flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Leads in this period" value={funnel.total} icon={UserPlus} />
        <StatCard label="Conversion rate" value={funnel.conversionRate} format="percent" icon={TrendingUp} accent="success" hint={`${funnel.won} won of ${funnel.total}`} />
        <StatCard label="Win rate on closed leads" value={funnel.closedRate} format="percent" icon={BadgePercent} accent="info" hint={`${funnel.won} won · ${funnel.lost} lost`} />
      </div>
      <Card>
        <SectionHeader title="Customer acquisition sources" description="Leads created in this period by source, and how many were won" action={<ExportButton report="lead-sources" range={range} />} />
        <CardContent className="grid gap-6 lg:grid-cols-2">
          {active.length === 0 ? (
            <EmptyState icon={UserPlus} title="No leads in this period" className="lg:col-span-2" />
          ) : (
            <>
              <BarList seriesLabel="Leads" data={active.sort((a, b) => b.total - a.total).map((s) => ({ label: LEAD_SOURCE_LABELS[s.source], value: s.total, note: `${s.won} won · ${s.conversionRate.toFixed(0)}% converted` }))} />
              <DataCard className="shadow-none">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Won</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Won value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.map((s) => (
                      <TableRow key={s.source}>
                        <TableCell>{LEAD_SOURCE_LABELS[s.source]}</TableCell>
                        <TableCell className="text-right">{s.total}</TableCell>
                        <TableCell className="text-right">{s.won}</TableCell>
                        <TableCell className="text-right">{s.conversionRate.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{formatINR(s.wonValuePaise)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataCard>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function ProjectsTab({ range }: { range: Range }) {
  const user = await requireUser();
  const report = await projectStatusReport(user, range);
  return (
    <div className="stagger flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Completed in this period" value={report.completedInRange} icon={CalendarCheck} accent="success" />
        <StatCard label="Overdue projects" value={report.overdue.length} icon={Info} accent={report.overdue.length ? "danger" : "info"} hint="Active and past the due date" />
        <StatCard label="All active projects" value={report.statuses.filter((s) => s.status !== "completed" && s.status !== "cancelled").reduce((t, s) => t + s.count, 0)} icon={TrendingUp} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Projects by status" action={<ExportButton report="projects" range={range} />} />
          <CardContent>
            <BarList seriesLabel="Projects" data={report.statuses.map((s) => ({ label: PROJECT_STATUS_LABELS[s.status], value: s.count, note: `Quoted ${formatINR(s.quotedPaise)}` }))} />
          </CardContent>
        </Card>
        <Card>
          <SectionHeader title="Overdue projects" description="Active projects past their due date" />
          <CardContent>
            {report.overdue.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="No overdue projects" />
            ) : (
              <ul className="flex flex-col divide-y">
                {report.overdue.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/projects/${p.id}`} className="flex min-w-0 flex-col">
                      <span className="hover:text-primary truncate text-sm font-medium">{p.name}</span>
                      <span className="text-destructive text-xs">
                        {p.customer} · due {formatDate(p.dueDate)} · {p.progress}% done
                      </span>
                    </Link>
                    <EnumBadge value={p.status} labels={PROJECT_STATUS_LABELS} tones={PROJECT_STATUS_TONES} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function CustomersTab({ range }: { range: Range }) {
  const { rows, newCustomers } = await customerActivityReport(range);
  return (
    <div className="stagger flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="New customers in this period" value={newCustomers} icon={UserPlus} accent="success" />
        <StatCard label="Customers with activity" value={rows.length} icon={TrendingUp} hint="Invoiced or paid in this period (top 25 shown)" />
      </div>
      <Card>
        <SectionHeader title="Customer activity" description="Ranked by money received in this period" action={<ExportButton report="customers" range={range} />} />
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={UserPlus} title="No customer activity in this period" />
          ) : (
            <DataCard className="shadow-none">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Outstanding now</TableHead>
                    <TableHead className="hidden lg:table-cell">Last payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/customers/${r.id}`} className="hover:text-primary font-medium">
                          {r.name}
                        </Link>
                        <span className="text-muted-foreground block text-xs">
                          {r.customerNumber}
                          {r.city && ` · ${r.city}`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatINR(r.invoicedPaise)}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(r.receivedPaise)}</TableCell>
                      <TableCell className="hidden text-right md:table-cell">{formatINR(r.outstandingPaise)}</TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">{r.lastPaymentAt ? formatDate(r.lastPaymentAt) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataCard>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function Reports({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "reports:read")) return <AccessDenied />;
  const sp = await searchParams;
  const range = resolveReportRange(sp);
  const tabParam = firstParam(sp, "tab");
  const tab: Tab = TABS.some((t) => t.value === tabParam) ? (tabParam as Tab) : "revenue";
  const query = (next: Tab) => {
    const params = new URLSearchParams();
    params.set("tab", next);
    if (range.preset) params.set("range", range.preset);
    else {
      params.set("from", range.fromInput);
      params.set("to", range.toInput);
    }
    return `/reports?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Report sections" className="bg-muted/60 inline-flex w-fit flex-wrap gap-1 rounded-lg p-1">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={query(t.value)}
              aria-current={tab === t.value ? "page" : undefined}
              scroll={false}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                tab === t.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <RangePicker preset={range.preset} from={range.fromInput} to={range.toInput} />
      </div>
      <p className="text-muted-foreground -mt-2 text-sm">
        {tab === "receivables" ? "Receivables are shown as of today." : `${formatDate(range.from)} – ${formatDate(range.to)}`}
      </p>
      <Suspense key={`${tab}-${range.fromInput}-${range.toInput}`} fallback={<TabSkeleton />}>
        {tab === "revenue" && <RevenueTab range={range} />}
        {tab === "receivables" && <ReceivablesTab range={range} />}
        {tab === "sales" && <SalesTab range={range} />}
        {tab === "projects" && <ProjectsTab range={range} />}
        {tab === "customers" && <CustomersTab range={range} />}
      </Suspense>
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="size-4" aria-hidden="true" /> How these figures are calculated
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {FINANCIAL_DEFINITIONS.map((d) => (
              <div key={d.term}>
                <dt className="font-medium">{d.term}</dt>
                <dd className="text-muted-foreground">{d.meaning}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <CardsSkeleton count={3} />
      <Skeleton className="h-96" />
    </div>
  );
}

export default function ReportsPage(props: PageProps<"/reports">) {
  return (
    <>
      <PageHeader title="Reports" description="Revenue, receivables, conversion and delivery — all from live data." />
      <Suspense fallback={<TabSkeleton />}>
        <Reports searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
