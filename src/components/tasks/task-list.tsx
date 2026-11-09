"use client";

import { BellRing, BriefcaseBusiness, Check, FolderKanban, MoreHorizontal, Pencil, Trash2, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EnumBadge, StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, toastError } from "@/lib/client/api";
import { PRIORITY_LABELS, REMINDER_OPTIONS, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";
import { PRIORITY_TONES, TASK_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatTime, relativeDayLabel, toDateTimeInputValue } from "@/lib/utils/date";
import type { TaskRow } from "@/services/task.service";
import { TaskFormSheet } from "./task-form-sheet";

type Relation = "lead" | "customer" | "project";

/**
 * Task rows with an inline "complete" checkbox. Completion shows instantly
 * (animated tick, struck-through title) and offers Undo; the server
 * confirms in the background.
 */
export function TaskList({
  tasks,
  now,
  currentUserId,
  canWrite,
  hideRelation,
  showDate = true,
  className,
}: {
  tasks: TaskRow[];
  now: string;
  currentUserId: string;
  canWrite: boolean;
  /** Hides the link to the record the list is shown on. */
  hideRelation?: Relation;
  showDate?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);
  const router = useRouter();

  return (
    <>
      <ul className={cn("stagger divide-y", className)}>
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            now={now}
            canWrite={canWrite}
            hideRelation={hideRelation}
            showDate={showDate}
            onEdit={() => setEditing(task)}
            onDelete={() => setDeleting(task)}
          />
        ))}
      </ul>
      <TaskFormSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        taskId={editing?.id}
        currentUserId={currentUserId}
        initialValues={
          editing
            ? {
                title: editing.title,
                description: editing.description,
                customer: editing.customer?.id ?? "",
                lead: editing.lead?.id ?? "",
                project: editing.project?.id ?? "",
                assignedTo: editing.assignedToId,
                dueAt: toDateTimeInputValue(editing.dueAt),
                priority: editing.priority,
                status: editing.status,
                reminderMinutes: String(editing.reminderMinutes),
              }
            : undefined
        }
        relationOptions={
          editing
            ? {
                customer: editing.customer && { value: editing.customer.id, label: editing.customer.label },
                lead: editing.lead && { value: editing.lead.id, label: editing.lead.label },
                project: editing.project && { value: editing.project.id, label: editing.project.label },
              }
            : undefined
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this task?"
        description={deleting ? `“${deleting.title}” will be permanently deleted. This is recorded in the activity log.` : undefined}
        confirmLabel="Delete task"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/api/tasks/${deleting.id}`, { method: "DELETE" });
          toast.success("Task deleted");
          router.refresh();
        }}
      />
    </>
  );
}

const REMINDER_LABEL = new Map<number, string>(REMINDER_OPTIONS.map((o) => [o.value, o.label]));

function TaskItem({
  task,
  now,
  canWrite,
  hideRelation,
  showDate,
  onEdit,
  onDelete,
}: {
  task: TaskRow;
  now: string;
  canWrite: boolean;
  hideRelation?: Relation;
  showDate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const serverDone = task.status === "completed";
  const [done, setDone] = useState(serverDone);
  const [prevStatus, setPrevStatus] = useState(task.status);
  if (task.status !== prevStatus) {
    setPrevStatus(task.status);
    setDone(task.status === "completed");
  }

  const cancelled = task.status === "cancelled";
  const overdue = task.overdue && !done;

  async function setStatus(status: TaskStatus, optimisticDone: boolean, announce = true) {
    setDone(optimisticDone);
    try {
      await api(`/api/tasks/${task.id}/status`, { method: "PATCH", body: { status } });
      if (announce) {
        toast.success(optimisticDone ? `Completed “${task.title}”` : `Reopened “${task.title}”`, {
          action: optimisticDone
            ? { label: "Undo", onClick: () => void setStatus(task.status === "completed" ? "todo" : task.status, false, false) }
            : undefined,
        });
      }
      // Let the tick and strike-through play before the row moves to another view.
      if (optimisticDone) await new Promise((resolve) => setTimeout(resolve, 650));
      startTransition(() => router.refresh());
    } catch (error) {
      setDone(!optimisticDone);
      toastError(error);
    }
  }

  const relations = (
    [
      ["project", task.project, FolderKanban],
      ["customer", task.customer, BriefcaseBusiness],
      ["lead", task.lead, UserPlus],
    ] as const
  ).filter(([kind, ref]) => ref && kind !== hideRelation);

  return (
    <li className={cn("group flex items-start gap-3 px-1 py-3 transition-opacity duration-300 sm:px-2", (done || cancelled) && "opacity-70")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
        disabled={!canWrite || cancelled}
        onClick={() => void setStatus(done ? "todo" : "completed", !done)}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
          "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-60",
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-input hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/15",
        )}
      >
        <Check
          className={cn("size-3 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]", done ? "scale-100" : "scale-0")}
          strokeWidth={3.5}
          aria-hidden="true"
        />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Strike-through drawn as a growing underline-style gradient so it animates across wrapped lines. */}
          <span
            className={cn(
              "bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat text-sm font-medium break-words [box-decoration-break:clone] [background-position:0_55%]",
              "transition-[background-size,color] duration-300 ease-out motion-reduce:transition-none",
              done || cancelled ? "text-muted-foreground [background-size:100%_1px]" : "[background-size:0%_1px]",
            )}
          >
            {task.title}
          </span>
          <EnumBadge value={task.priority} labels={PRIORITY_LABELS} tones={PRIORITY_TONES} />
          {task.status === "in_progress" && !done && (
            <EnumBadge value={task.status} labels={TASK_STATUS_LABELS} tones={TASK_STATUS_TONES} />
          )}
          {cancelled && <StatusBadge tone="muted">Cancelled</StatusBadge>}
        </div>
        {task.description && <p className="text-muted-foreground line-clamp-2 text-xs">{task.description}</p>}
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={cn("inline-flex items-center gap-1 font-medium", overdue && "text-destructive")}>
            {overdue && <span className="sr-only">Overdue: </span>}
            {showDate ? `${relativeDayLabel(task.dueAt, now)}, ` : ""}
            {formatTime(task.dueAt)}
            {overdue && (
              <span className="bg-destructive/10 ring-destructive/20 ml-1 rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset" aria-hidden="true">
                Overdue
              </span>
            )}
          </span>
          {relations.map(([kind, ref, Icon]) => (
            <Link
              key={kind}
              href={ref!.href}
              className="hover:text-primary inline-flex max-w-48 items-center gap-1 transition-colors"
              title={`${kind[0].toUpperCase()}${kind.slice(1)}: ${ref!.label}`}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="sr-only">{kind}: </span>
              <span className="truncate">{ref!.label}</span>
            </Link>
          ))}
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Assigned to </span>
            {task.assignedToName ?? "Unknown"}
          </span>
          {task.reminderMinutes > 0 && !done && !cancelled && (
            <span className="inline-flex items-center gap-1" title="Reminder">
              <BellRing className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Reminder: </span>
              {REMINDER_LABEL.get(task.reminderMinutes)}
            </span>
          )}
        </div>
      </div>

      {canWrite && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={`Actions for ${task.title}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden="true" /> Edit
            </DropdownMenuItem>
            {!done && !cancelled && task.status !== "in_progress" && (
              <DropdownMenuItem onSelect={() => void setStatus("in_progress", false, false)}>Mark in progress</DropdownMenuItem>
            )}
            {!done && !cancelled && (
              <DropdownMenuItem onSelect={() => void setStatus("cancelled", false, false)}>Cancel task</DropdownMenuItem>
            )}
            {cancelled && <DropdownMenuItem onSelect={() => void setStatus("todo", false, false)}>Reopen</DropdownMenuItem>}
            {task.canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 aria-hidden="true" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
