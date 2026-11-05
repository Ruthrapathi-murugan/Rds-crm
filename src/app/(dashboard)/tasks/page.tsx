import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarCheck2, CircleCheckBig, ListChecks, PartyPopper } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { DataCard } from "@/components/data-table/data-card";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar, type ListFilter } from "@/components/data-table/list-toolbar";
import { ListBody, ListView } from "@/components/data-table/list-view";
import { TableSkeleton } from "@/components/data-table/table-skeleton";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import { TaskList } from "@/components/tasks/task-list";
import { TaskViewTabs } from "@/components/tasks/task-view-tabs";
import { requireUser } from "@/lib/auth/current-user";
import { optionsOf, PRIORITIES, PRIORITY_LABELS } from "@/lib/constants";
import { enumParam, firstParam, parseListParams, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { monthKey, toDateInputValue } from "@/lib/utils/date";
import { TASK_VIEWS, type TaskView } from "@/lib/validations/task";
import { defaultTaskSort, listTasks, TASK_SORTS, taskViewCounts, tasksForCalendar } from "@/services/task.service";
import { userOptions } from "@/services/user.service";

export const metadata: Metadata = { title: "Tasks & follow-ups" };

const EMPTY: Record<TaskView, { title: string; description: string; icon: typeof ListChecks }> = {
  today: { title: "Nothing due today", description: "Enjoy the clear day, or plan ahead with a new task.", icon: PartyPopper },
  upcoming: { title: "No upcoming tasks", description: "Tasks due after today will appear here.", icon: CalendarCheck2 },
  overdue: { title: "Nothing overdue", description: "Every open task is on schedule.", icon: CircleCheckBig },
  completed: { title: "No completed tasks yet", description: "Tick off a task and it will be listed here.", icon: CircleCheckBig },
  all: { title: "No tasks yet", description: "Add follow-up calls, delivery steps and reminders for your team.", icon: ListChecks },
};

async function HeaderActions() {
  const user = await requireUser();
  return hasPermission(user, "tasks:write") ? <NewTaskButton currentUserId={user.id} /> : null;
}

async function TasksContent({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "tasks:read")) return <AccessDenied />;

  const sp = await searchParams;
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const calendar = firstParam(sp, "view") === "calendar";
  const view: TaskView = enumParam(sp, "view", TASK_VIEWS) ?? "today";
  const filters = { assignedTo: firstParam(sp, "assignedTo"), priority: enumParam(sp, "priority", PRIORITIES) };
  const canWrite = hasPermission(user, "tasks:write");
  const team = hasPermission(user, "records:all") ? await userOptions() : [];

  const toolbarFilters: ListFilter[] = [
    { key: "priority", label: "Priorities", options: optionsOf(PRIORITIES, PRIORITY_LABELS) },
    {
      key: "assignedTo",
      label: "Assignees",
      options: [{ value: "me", label: "Assigned to me" }, ...team.map((u) => ({ value: u.value, label: u.label }))],
    },
  ];

  if (calendar) {
    const requested = firstParam(sp, "month");
    const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : monthKey(nowDate);
    const [counts, tasks] = await Promise.all([taskViewCounts(user, filters), tasksForCalendar(user, month, filters)]);
    return (
      <ListView>
        <TaskViewTabs active="calendar" counts={counts} />
        <TaskCalendar
          month={month}
          todayKey={toDateInputValue(nowDate)}
          tasks={tasks}
          now={now}
          currentUserId={user.id}
          canWrite={canWrite}
        />
      </ListView>
    );
  }

  const defaults = defaultTaskSort(view);
  const params = parseListParams(sp, { sortable: TASK_SORTS, defaultSort: defaults.sort, defaultDir: defaults.dir });
  const [result, counts] = await Promise.all([listTasks(user, view, params, filters), taskViewCounts(user, filters)]);
  const hasFilters = Boolean(params.q || filters.assignedTo || filters.priority);
  const empty = EMPTY[view];

  return (
    <ListView defaultSort={defaults.sort} defaultDir={defaults.dir}>
      <TaskViewTabs active={view} counts={counts} />
      <ListToolbar searchPlaceholder="Search tasks…" filters={toolbarFilters} />
      <ListBody>
        <DataCard>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={hasFilters ? ListChecks : empty.icon}
              title={hasFilters ? "No tasks match your filters" : empty.title}
              description={hasFilters ? "Try a different search or clear the filters." : empty.description}
            />
          ) : (
            <TaskList tasks={result.rows} now={now} currentUserId={user.id} canWrite={canWrite} className="px-3 sm:px-4" />
          )}
        </DataCard>
      </ListBody>
      {result.total > 0 && (
        <ListPagination page={result.page} pageCount={result.pageCount} pageSize={result.pageSize} total={result.total} noun="tasks" />
      )}
    </ListView>
  );
}

export default function TasksPage(props: PageProps<"/tasks">) {
  return (
    <>
      <PageHeader
        title="Tasks & follow-ups"
        description="Calls to make, steps to deliver and reminders — all times in IST."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton columns={4} />}>
        <TasksContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
