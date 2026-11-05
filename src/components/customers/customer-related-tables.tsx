import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { EnumBadge } from "@/components/common/status-badge";
import { DataCard } from "@/components/data-table/data-card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  QUOTATION_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import {
  INVOICE_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  PRIORITY_TONES,
  PROJECT_STATUS_TONES,
  QUOTATION_STATUS_TONES,
  TASK_STATUS_TONES,
} from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import type {
  CustomerInvoiceItem,
  CustomerPaymentItem,
  CustomerProjectItem,
  CustomerQuotationItem,
  CustomerTaskItem,
} from "@/services/customer.service";

const headRow = "bg-muted/40 hover:bg-muted/40";
const linkCell = "hover:text-primary font-medium transition-colors outline-none focus-visible:underline";

function Empty({ icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <DataCard>
      <EmptyState icon={icon} title={title} description={description} action={action} className="py-10" />
    </DataCard>
  );
}

export function ProjectsTable({ items, empty }: { items: CustomerProjectItem[]; empty: React.ComponentProps<typeof Empty> }) {
  if (items.length === 0) return <Empty {...empty} />;
  return (
    <DataCard>
      <Table>
        <TableHeader>
          <TableRow className={headRow}>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Progress</TableHead>
            <TableHead>Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="stagger">
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="max-w-72">
                <Link href={`/projects/${p.id}`} className={cn(linkCell, "flex flex-col gap-0.5")}>
                  <span className="truncate">{p.name}</span>
                  <span className="text-muted-foreground text-xs font-normal">{p.projectNumber}</span>
                </Link>
              </TableCell>
              <TableCell>
                <EnumBadge value={p.status} labels={PROJECT_STATUS_LABELS} tones={PROJECT_STATUS_TONES} />
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <div className="flex items-center gap-2">
                  <Progress value={p.progress} className="h-1.5 w-24" aria-label={`${p.progress}% complete`} />
                  <span className="text-muted-foreground text-xs tabular-nums">{p.progress}%</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{p.dueDate ? formatDate(p.dueDate) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataCard>
  );
}

export function QuotationsTable({ items, empty }: { items: CustomerQuotationItem[]; empty: React.ComponentProps<typeof Empty> }) {
  if (items.length === 0) return <Empty {...empty} />;
  return (
    <DataCard>
      <Table>
        <TableHeader>
          <TableRow className={headRow}>
            <TableHead>Quotation</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="stagger">
          {items.map((q) => (
            <TableRow key={q.id}>
              <TableCell>
                <Link href={`/quotations/${q.id}`} className={linkCell}>
                  {q.quotationNumber}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(q.issueDate)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatINR(q.totalPaise)}</TableCell>
              <TableCell>
                <EnumBadge value={q.status} labels={QUOTATION_STATUS_LABELS} tones={QUOTATION_STATUS_TONES} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataCard>
  );
}

export function InvoicesTable({ items, empty }: { items: CustomerInvoiceItem[]; empty: React.ComponentProps<typeof Empty> }) {
  if (items.length === 0) return <Empty {...empty} />;
  return (
    <DataCard>
      <Table>
        <TableHeader>
          <TableRow className={headRow}>
            <TableHead>Invoice</TableHead>
            <TableHead className="hidden sm:table-cell">Issued</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="stagger">
          {items.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell>
                <Link href={`/invoices/${inv.id}`} className={cn(linkCell, inv.invoiceNumber === "Draft" && "text-muted-foreground italic")}>
                  {inv.invoiceNumber}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">{formatDate(inv.issueDate)}</TableCell>
              <TableCell className={cn("text-muted-foreground", inv.status === "overdue" && "text-destructive font-medium")}>
                {formatDate(inv.dueDate)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(inv.totalPaise)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {inv.status === "draft" || inv.status === "cancelled" ? (
                  <span className="text-muted-foreground font-normal">—</span>
                ) : (
                  formatINR(inv.balancePaise)
                )}
              </TableCell>
              <TableCell>
                <EnumBadge value={inv.status} labels={INVOICE_STATUS_LABELS} tones={INVOICE_STATUS_TONES} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataCard>
  );
}

export function PaymentsTable({ items, empty }: { items: CustomerPaymentItem[]; empty: React.ComponentProps<typeof Empty> }) {
  if (items.length === 0) return <Empty {...empty} />;
  return (
    <DataCard>
      <Table>
        <TableHeader>
          <TableRow className={headRow}>
            <TableHead>Payment</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="hidden sm:table-cell">Method</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="stagger">
          {items.map((p) => {
            const voided = p.status === "voided";
            return (
              <TableRow key={p.id} className={cn(voided && "text-muted-foreground")}>
                <TableCell>
                  <Link href={`/payments?q=${encodeURIComponent(p.paymentNumber)}`} className={linkCell}>
                    {p.paymentNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(p.paidAt)}</TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", voided && "font-normal line-through")}>
                  {formatINR(p.amountPaise)}
                </TableCell>
                <TableCell>
                  <EnumBadge value={p.status} labels={PAYMENT_STATUS_LABELS} tones={PAYMENT_STATUS_TONES} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </DataCard>
  );
}

export function TasksTable({ items, now, empty }: { items: CustomerTaskItem[]; now: Date; empty: React.ComponentProps<typeof Empty> }) {
  if (items.length === 0) return <Empty {...empty} />;
  return (
    <DataCard>
      <Table>
        <TableHeader>
          <TableRow className={headRow}>
            <TableHead>Task</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="hidden sm:table-cell">Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Assignee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="stagger">
          {items.map((t) => {
            const overdue = (t.status === "todo" || t.status === "in_progress") && new Date(t.dueAt) < now;
            return (
              <TableRow key={t.id}>
                <TableCell className="max-w-72 truncate font-medium">{t.title}</TableCell>
                <TableCell className={cn("text-muted-foreground", overdue && "text-destructive font-medium")}>
                  {formatDateTime(t.dueAt)}
                  {overdue && <span className="sr-only"> (overdue)</span>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <EnumBadge value={t.priority} labels={PRIORITY_LABELS} tones={PRIORITY_TONES} />
                </TableCell>
                <TableCell>
                  <EnumBadge value={t.status} labels={TASK_STATUS_LABELS} tones={TASK_STATUS_TONES} />
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">{t.assigneeName ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </DataCard>
  );
}

