"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useListView } from "./list-view";

/** Column header that toggles server-side sorting via the URL. */
export function SortableHeader({
  field,
  children,
  className,
  align = "left",
}: {
  field: string;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const { params, setParams, defaultSort, defaultDir } = useListView();
  const currentSort = params.get("sort") ?? defaultSort;
  const currentDir = (params.get("dir") as "asc" | "desc" | null) ?? defaultDir;
  const active = currentSort === field;
  const nextDir = active && currentDir === "desc" ? "asc" : "desc";
  const Icon = !active ? ArrowUpDown : currentDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={cn(align === "right" && "text-right", className)}
      aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => setParams({ sort: field, dir: nextDir })}
        className={cn(
          "hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors",
          "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {children}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden="true" />
      </button>
    </TableHead>
  );
}
