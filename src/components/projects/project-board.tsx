"use client";

import { FolderKanban, MoreHorizontal, UserRound } from "lucide-react";
import Link from "next/link";
import { useOptimistic } from "react";
import { EnumBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ACTIVE_PROJECT_STATUSES, PRIORITY_LABELS, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/constants";
import { PRIORITY_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import type { ActiveProjectStatus, ProjectRow } from "@/services/project.service";
import { DueDate } from "./due-date";
import { ProgressBar } from "./progress-bar";
import { ProjectStatusMenuItems } from "./project-status-menu-items";
import { useProjectStatus } from "./use-project-status";

type Board = Record<ActiveProjectStatus, ProjectRow[]>;

const COLUMN_ACCENT: Record<ActiveProjectStatus, string> = {
  not_started: "bg-slate-400",
  in_progress: "bg-sky-500",
  waiting_for_client: "bg-amber-500",
  on_hold: "bg-violet-500",
};

function moveCard(board: Board, move: { id: string; to: ProjectStatus }): Board {
  let card: ProjectRow | undefined;
  const next = Object.fromEntries(
    ACTIVE_PROJECT_STATUSES.map((s) => [
      s,
      board[s].filter((p) => {
        if (p.id !== move.id) return true;
        card = p;
        return false;
      }),
    ]),
  ) as Board;
  if (card && (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(move.to)) {
    next[move.to as ActiveProjectStatus] = [{ ...card, status: move.to }, ...next[move.to as ActiveProjectStatus]];
  }
  return next;
}

/**
 * Kanban of active projects. Cards move between columns from their menu
 * (keyboard and touch friendly); the move shows instantly and is confirmed
 * by the server. Completed or cancelled projects leave the board.
 */
export function ProjectBoard({ board, now, canWrite }: { board: Board; now: string; canWrite: boolean }) {
  const [optimistic, applyMove] = useOptimistic(board, moveCard);
  const { changeStatus } = useProjectStatus();

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="stagger grid auto-cols-[minmax(272px,1fr)] grid-flow-col gap-4 xl:grid-flow-row xl:grid-cols-4">
        {ACTIVE_PROJECT_STATUSES.map((status) => {
          const cards = optimistic[status];
          return (
            <section
              key={status}
              aria-labelledby={`col-${status}`}
              className="bg-muted/40 flex min-h-48 snap-start flex-col gap-3 rounded-xl border p-3"
            >
              <header className="flex items-center justify-between gap-2 px-1">
                <h2 id={`col-${status}`} className="flex items-center gap-2 text-sm font-semibold">
                  <span aria-hidden="true" className={cn("size-2 rounded-full", COLUMN_ACCENT[status])} />
                  {PROJECT_STATUS_LABELS[status]}
                </h2>
                <span className="bg-background text-muted-foreground rounded-full px-2 text-xs tabular-nums ring-1 ring-inset ring-border">
                  {cards.length}
                </span>
              </header>
              {cards.length === 0 ? (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-8 text-center text-xs">
                  <FolderKanban className="size-5 opacity-60" aria-hidden="true" />
                  No projects here
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {cards.map((project) => (
                    <li key={project.id} className="animate-fade-up">
                      <ProjectCard
                        project={project}
                        now={now}
                        canWrite={canWrite}
                        onMove={(to) => changeStatus(project.id, to, () => applyMove({ id: project.id, to }))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  now,
  canWrite,
  onMove,
}: {
  project: ProjectRow;
  now: string;
  canWrite: boolean;
  onMove: (status: ProjectStatus) => void;
}) {
  return (
    <article
      className={cn(
        "bg-card hover-lift group relative flex flex-col gap-3 rounded-lg border p-3 shadow-xs",
        project.overdue && "border-destructive/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/projects/${project.id}`}
            className="group-hover:text-primary line-clamp-2 text-sm font-medium transition-colors outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
          >
            {project.name}
          </Link>
          <p className="text-muted-foreground truncate text-xs">
            {project.projectNumber} · {project.customerName}
          </p>
        </div>
        {canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="relative z-10 -mr-1 shrink-0" aria-label={`Move ${project.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ProjectStatusMenuItems current={project.status} onSelect={onMove} />
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}`}>Open project</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <EnumBadge value={project.priority} labels={PRIORITY_LABELS} tones={PRIORITY_TONES} />
        {project.quotedAmountPaise > 0 && (
          <span className="text-muted-foreground ml-auto text-xs font-medium tabular-nums">{formatINR(project.quotedAmountPaise)}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar value={project.progress} label={`${project.name} progress`} className="flex-1" />
        <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">{project.progress}%</span>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <DueDate due={project.dueDate} overdue={project.overdue} now={now} showIcon />
        <span className="inline-flex max-w-[45%] items-center gap-1 truncate">
          <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{project.assignedToName ?? "Unassigned"}</span>
        </span>
      </div>
    </article>
  );
}
