"use client";

import { CalendarCheck2, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useListView } from "@/components/data-table/list-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatTime, toDateInputValue } from "@/lib/utils/date";
import type { TaskRow } from "@/services/task.service";
import { TaskList } from "./task-list";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Priority chip styles. Each chip also carries a letter, so colour never stands alone. */
const CHIP: Record<Priority, { chip: string; tag: string; letter: string }> = {
  low: {
    chip: "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-slate-500/30",
    tag: "bg-slate-200 text-slate-700 dark:bg-slate-500/30 dark:text-slate-200",
    letter: "L",
  },
  medium: {
    chip: "bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30",
    tag: "bg-sky-200 text-sky-900 dark:bg-sky-500/30 dark:text-sky-100",
    letter: "M",
  },
  high: {
    chip: "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30",
    tag: "bg-amber-200 text-amber-950 dark:bg-amber-500/30 dark:text-amber-100",
    letter: "H",
  },
  urgent: {
    chip: "bg-red-50 text-red-900 ring-red-200 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-500/30",
    tag: "bg-red-200 text-red-900 dark:bg-red-500/30 dark:text-red-100",
    letter: "U",
  },
};

type Day = { key: string; day: number; inMonth: boolean };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Monday-first weeks covering the month. Calendar dates are timezone-free once in "yyyy-MM". */
function buildWeeks(month: string): Day[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(y, m - 1, 1 - lead));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const days: Day[] = Array.from({ length: total }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000);
    return {
      key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m - 1,
    };
  });
  return Array.from({ length: total / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
}

function longDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
  return `${weekday}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Month calendar in IST. Desktop shows a Mon–Sun grid with priority chips;
 * picking a day lists its tasks below. Phones get an agenda list instead.
 */
export function TaskCalendar({
  month,
  todayKey,
  tasks,
  now,
  currentUserId,
  canWrite,
}: {
  month: string;
  todayKey: string;
  tasks: TaskRow[];
  now: string;
  currentUserId: string;
  canWrite: boolean;
}) {
  const { setParams, isPending } = useListView();
  const weeks = useMemo(() => buildWeeks(month), [month]);
  const byDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      const key = toDateInputValue(task.dueAt);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks]);

  const defaultDay = todayKey.startsWith(month) ? todayKey : `${month}-01`;
  const [selected, setSelected] = useState(defaultDay);
  const [prevMonth, setPrevMonth] = useState(month);
  if (month !== prevMonth) {
    setPrevMonth(month);
    setSelected(defaultDay);
  }

  const [y, m] = month.split("-").map(Number);
  const title = `${MONTHS[m - 1]} ${y}`;
  const selectedTasks = byDay.get(selected) ?? [];
  const agendaDays = [...byDay.keys()].sort();

  return (
    <div className="flex flex-col gap-4" data-pending={isPending} aria-busy={isPending}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold tracking-tight" aria-live="polite">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setParams({ month: shiftMonth(month, -1) })} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setParams({ month: null })} disabled={todayKey.startsWith(month)}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setParams({ month: shiftMonth(month, 1) })} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <ul className="text-muted-foreground hidden flex-wrap gap-3 text-xs md:flex" aria-label="Priority key">
        {PRIORITIES.map((p) => (
          <li key={p} className="inline-flex items-center gap-1.5">
            <span className={cn("rounded px-1 text-[10px] font-bold", CHIP[p].tag)}>{CHIP[p].letter}</span>
            {PRIORITY_LABELS[p]}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="line-through">Struck through</span> = completed
        </li>
      </ul>

      {/* Desktop month grid */}
      <Card className="hidden gap-0 overflow-hidden p-0 md:flex">
        <div role="grid" aria-label={title} className="flex flex-col">
          <div role="row" className="bg-muted/40 grid grid-cols-7 border-b">
            {WEEKDAYS.map((d) => (
              <div key={d} role="columnheader" className="text-muted-foreground px-2 py-2 text-xs font-medium tracking-wide uppercase">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week, w) => (
            <div key={w} role="row" className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day) => {
                const dayTasks = byDay.get(day.key) ?? [];
                const isToday = day.key === todayKey;
                const isSelected = day.key === selected;
                const open = dayTasks.filter((t) => t.status !== "completed").length;
                return (
                  <div key={day.key} role="gridcell" aria-selected={isSelected} className="border-r last:border-r-0">
                    <button
                      type="button"
                      onClick={() => setSelected(day.key)}
                      disabled={!day.inMonth}
                      aria-label={`${longDate(day.key)}${dayTasks.length ? `, ${dayTasks.length} task${dayTasks.length > 1 ? "s" : ""}` : ", no tasks"}`}
                      className={cn(
                        "flex h-full min-h-28 w-full flex-col gap-1 p-1.5 text-left transition-colors duration-150",
                        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] focus-visible:ring-inset",
                        day.inMonth ? "hover:bg-primary/5" : "bg-muted/30 text-muted-foreground/60 cursor-default",
                        isSelected && day.inMonth && "bg-primary/5 ring-primary/40 ring-2 ring-inset",
                      )}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                            isToday && "bg-primary text-primary-foreground",
                          )}
                        >
                          {day.day}
                        </span>
                        {isToday && <span className="text-primary text-[10px] font-semibold tracking-wide uppercase">Today</span>}
                        {!isToday && open > 0 && day.inMonth && (
                          <span className="text-muted-foreground text-[10px] tabular-nums">{open} open</span>
                        )}
                      </span>
                      {day.inMonth &&
                        dayTasks.slice(0, 3).map((task) => (
                          <span
                            key={task.id}
                            className={cn(
                              "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight ring-1 ring-inset",
                              CHIP[task.priority].chip,
                              task.status === "completed" && "opacity-60",
                              task.overdue && "ring-destructive/50",
                            )}
                          >
                            <span className={cn("shrink-0 rounded px-0.5 text-[9px] font-bold", CHIP[task.priority].tag)}>
                              {CHIP[task.priority].letter}
                              <span className="sr-only"> {PRIORITY_LABELS[task.priority]} priority</span>
                            </span>
                            <span className="shrink-0 tabular-nums opacity-80">{formatTime(task.dueAt).replace(":00", "")}</span>
                            <span className={cn("truncate", task.status === "completed" && "line-through")}>{task.title}</span>
                          </span>
                        ))}
                      {day.inMonth && dayTasks.length > 3 && (
                        <span className="text-muted-foreground px-1 text-[11px] font-medium">+{dayTasks.length - 3} more</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      {/* Selected day (desktop) */}
      <Card className="animate-fade-up hidden gap-3 p-4 md:flex" key={selected}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">
            {longDate(selected)}
            {selected === todayKey && <span className="text-primary ml-2 text-xs font-semibold uppercase">Today</span>}
          </h3>
          <span className="text-muted-foreground text-sm">
            {selectedTasks.length} task{selectedTasks.length === 1 ? "" : "s"}
          </span>
        </div>
        {selectedTasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing due on this day.</p>
        ) : (
          <TaskList tasks={selectedTasks} now={now} currentUserId={currentUserId} canWrite={canWrite} showDate={false} />
        )}
      </Card>

      {/* Phone agenda */}
      <div className="flex flex-col gap-4 md:hidden">
        {agendaDays.length === 0 ? (
          <Card className="text-muted-foreground flex-row items-center gap-3 p-4 text-sm">
            <CalendarCheck2 className="size-5" aria-hidden="true" /> No tasks due in {title}.
          </Card>
        ) : (
          agendaDays.map((key) => (
            <Card key={key} className={cn("gap-1 p-4", key === todayKey && "border-primary/40")}>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                {longDate(key)}
                {key === todayKey && <span className="text-primary text-xs font-semibold uppercase">Today</span>}
              </h3>
              <TaskList tasks={byDay.get(key) ?? []} now={now} currentUserId={currentUserId} canWrite={canWrite} showDate={false} />
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
