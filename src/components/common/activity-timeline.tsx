import { History } from "lucide-react";
import { formatDateTime } from "@/lib/utils/date";
import type { ActivityEntry } from "@/services/activity.service";

/** Vertical audit/activity trail for a record. */
export function ActivityTimeline({ entries, emptyText = "No activity yet." }: { entries: ActivityEntry[]; emptyText?: string }) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <History className="size-4" aria-hidden="true" /> {emptyText}
      </p>
    );
  }
  return (
    <ol className="stagger relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
      {entries.map((entry) => (
        <li key={entry.id} className="relative flex gap-3 pl-6">
          <span aria-hidden="true" className="bg-background ring-primary/40 absolute top-1.5 left-0 size-[11px] rounded-full ring-2" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm">{entry.message}</p>
            <p className="text-muted-foreground text-xs">
              {entry.actorName} · {formatDateTime(entry.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
