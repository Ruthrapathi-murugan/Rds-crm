"use client";

import { CalendarDays } from "lucide-react";
import { useListView } from "@/components/data-table/list-view";
import { cn } from "@/lib/utils";
import type { TaskView } from "@/lib/validations/task";
import type { TaskViewCounts } from "@/services/task.service";

const TABS: { value: TaskView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
];

/** View tabs kept in the URL (?view=…), with live counts. */
export function TaskViewTabs({ active, counts }: { active: TaskView | "calendar"; counts: TaskViewCounts }) {
  const { setParams } = useListView();
  const nf = new Intl.NumberFormat("en-IN");

  function select(view: TaskView | "calendar") {
    setParams({ view: view === "today" ? null : view, month: null, sort: null, dir: null });
  }

  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Task views">
      {TABS.map((tab) => {
        const selected = tab.value === active;
        const alert = tab.value === "overdue" && counts.overdue > 0;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => select(tab.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
              "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "bg-card hover:border-primary/40 hover:bg-primary/5",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                selected ? "bg-primary-foreground/20" : alert ? "bg-red-100 font-semibold text-red-800 dark:bg-red-500/20 dark:text-red-300" : "bg-muted text-muted-foreground",
              )}
            >
              {nf.format(counts[tab.value])}
            </span>
          </button>
        );
      })}
      <span aria-hidden="true" className="bg-border mx-1 my-1.5 w-px shrink-0" />
      <button
        type="button"
        role="tab"
        aria-selected={active === "calendar"}
        onClick={() => select("calendar")}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
          "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
          active === "calendar"
            ? "border-primary bg-primary text-primary-foreground shadow-sm"
            : "bg-card hover:border-primary/40 hover:bg-primary/5",
        )}
      >
        <CalendarDays className="size-4" aria-hidden="true" /> Calendar
      </button>
    </div>
  );
}
