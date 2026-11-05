"use client";

import { KanbanSquare, List } from "lucide-react";
import { useListView } from "@/components/data-table/list-view";
import { cn } from "@/lib/utils";

/** List / Board toggle kept in the URL (?view=board). */
export function ProjectViewSwitch({ view }: { view: "list" | "board" }) {
  const { setParams } = useListView();
  const options = [
    { value: "list" as const, label: "List", icon: List },
    { value: "board" as const, label: "Board", icon: KanbanSquare },
  ];
  return (
    <div role="radiogroup" aria-label="Layout" className="bg-muted inline-flex rounded-lg p-[3px]">
      {options.map((option) => {
        const selected = option.value === view;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setParams({ view: option.value === "list" ? null : "board", status: null, archived: null })}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all duration-200",
              "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
              selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <option.icon className="size-4" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
