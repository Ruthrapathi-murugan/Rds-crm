"use client";

import { useListView } from "@/components/data-table/list-view";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** One pill per status with its count; filters the list. */
export function ProjectStatusPills({ counts }: { counts: Record<ProjectStatus, number> }) {
  const { params, setParams } = useListView();
  const active = params.get("status");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const nf = new Intl.NumberFormat("en-IN");

  const pills: { value: ProjectStatus | null; label: string; count: number }[] = [
    { value: null, label: "All", count: total },
    ...PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s], count: counts[s] })),
  ];

  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter by status">
      {pills.map((pill) => {
        const selected = (pill.value ?? null) === (active ?? null);
        return (
          <button
            key={pill.label}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setParams({ status: pill.value })}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
              "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "bg-card hover:border-primary/40 hover:bg-primary/5",
            )}
          >
            {pill.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                selected ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
              )}
            >
              {nf.format(pill.count)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
