import { AlertTriangle, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, relativeDayLabel } from "@/lib/utils/date";

/**
 * Deadline with an explicit "Overdue" marker (icon + text, not colour alone).
 * `now` comes from the server so server and client render the same label.
 */
export function DueDate({
  due,
  overdue,
  now,
  done = false,
  className,
  showIcon = false,
}: {
  due: string | null;
  overdue: boolean;
  now: string;
  done?: boolean;
  className?: string;
  showIcon?: boolean;
}) {
  if (!due) return <span className={cn("text-muted-foreground", className)}>No deadline</span>;
  const relative = relativeDayLabel(due, now);
  const label = relative === formatDate(due) ? relative : `${relative} · ${formatDate(due)}`;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span className={cn("inline-flex items-center gap-1.5", overdue && "text-destructive font-medium", done && "text-muted-foreground")}>
        {showIcon && <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />}
        {label}
      </span>
      {overdue && (
        <span className="bg-destructive/10 text-destructive ring-destructive/20 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset">
          <AlertTriangle className="size-3" aria-hidden="true" /> Overdue
        </span>
      )}
    </span>
  );
}
