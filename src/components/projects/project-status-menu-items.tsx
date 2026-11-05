"use client";

import { Check } from "lucide-react";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from "@/lib/constants";
import { PROJECT_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-500",
  warning: "bg-amber-500",
  violet: "bg-violet-500",
  success: "bg-emerald-500",
  muted: "bg-muted-foreground/50",
};

/** "Move to" items for a project status dropdown. */
export function ProjectStatusMenuItems({ current, onSelect }: { current: ProjectStatus; onSelect: (status: ProjectStatus) => void }) {
  return (
    <>
      <DropdownMenuLabel>Move to</DropdownMenuLabel>
      {PROJECT_STATUSES.map((status) => (
        <DropdownMenuItem key={status} disabled={status === current} onSelect={() => onSelect(status)}>
          <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[PROJECT_STATUS_TONES[status]])} />
          {PROJECT_STATUS_LABELS[status]}
          {status === current && <Check className="ml-auto size-4" aria-label="Current status" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}
