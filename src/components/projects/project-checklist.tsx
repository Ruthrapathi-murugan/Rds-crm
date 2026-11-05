"use client";

import { Check, ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, toastError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/date";
import type { ChecklistItem } from "@/services/project.service";
import { ProgressBar } from "./progress-bar";

/** Interactive delivery checklist: add, tick off (optimistically) and remove items. */
export function ProjectChecklist({ projectId, items, editable }: { projectId: string; items: ChecklistItem[]; editable: boolean }) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [prevItems, setPrevItems] = useState(items);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<ChecklistItem | null>(null);

  if (items !== prevItems) {
    setPrevItems(items);
    setList(items);
  }

  const done = list.filter((i) => i.done).length;
  const base = `/api/projects/${projectId}/checklist`;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) {
      setError("Type what needs to be done");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const next = await api<ChecklistItem[]>(base, { body: { title: text } });
      setFresh(next.at(-1)?.id ?? null);
      setList(next);
      setTitle("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the item");
    } finally {
      setAdding(false);
    }
  }

  async function toggle(item: ChecklistItem) {
    const nextDone = !item.done;
    setList((current) => current.map((i) => (i.id === item.id ? { ...i, done: nextDone } : i)));
    try {
      const next = await api<ChecklistItem[]>(`${base}/${item.id}`, { method: "PATCH", body: { done: nextDone } });
      setList(next);
      router.refresh();
    } catch (err) {
      setList((current) => current.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)));
      toastError(err);
    }
  }

  async function remove(item: ChecklistItem) {
    const next = await api<ChecklistItem[]>(`${base}/${item.id}`, { method: "DELETE" });
    setRemoving(item.id);
    // Let the row fade out before it leaves the list.
    setTimeout(() => {
      setList(next);
      setRemoving(null);
      router.refresh();
    }, 220);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ProgressBar value={list.length ? (done / list.length) * 100 : 0} label="Checklist completion" className="flex-1" />
        <span className="text-muted-foreground text-xs font-medium whitespace-nowrap tabular-nums">
          {done}/{list.length} done
        </span>
      </div>

      {list.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <ListChecks className="size-4" aria-hidden="true" /> No checklist items yet.
          {editable && " Break the work into steps below."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((item) => (
            <li
              key={item.id}
              className={cn(
                "group flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-200",
                item.done ? "bg-muted/40" : "bg-card",
                item.id === fresh && "animate-fade-up",
                removing === item.id && "pointer-events-none -translate-x-2 opacity-0",
              )}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={item.done}
                aria-label={item.done ? `Mark “${item.title}” as not done` : `Mark “${item.title}” as done`}
                disabled={!editable}
                onClick={() => void toggle(item)}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:cursor-default",
                  item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-input hover:border-primary",
                )}
              >
                <Check className={cn("size-3.5 transition-transform duration-200", item.done ? "scale-100" : "scale-0")} strokeWidth={3} aria-hidden="true" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "text-sm break-words transition-colors duration-200",
                    item.done && "text-muted-foreground line-through decoration-1",
                  )}
                >
                  {item.title}
                </span>
                {item.done && item.doneAt && (
                  <span className="text-muted-foreground animate-fade-in text-xs">
                    Done {formatDateTime(item.doneAt)}
                    {item.doneByName ? ` by ${item.doneByName}` : ""}
                  </span>
                )}
              </div>
              {editable && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  aria-label={`Remove “${item.title}”`}
                  onClick={() => setConfirmItem(item)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form onSubmit={add} className="flex flex-col gap-1.5" noValidate>
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Add a step, e.g. Collect logo and photos"
              maxLength={300}
              aria-label="New checklist item"
              aria-invalid={Boolean(error)}
              disabled={adding}
            />
            <Button type="submit" variant="outline" disabled={adding}>
              {adding ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              Add
            </Button>
          </div>
          {error && (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      <ConfirmDialog
        open={confirmItem !== null}
        onOpenChange={(open) => !open && setConfirmItem(null)}
        title="Remove this checklist item?"
        description={confirmItem ? `“${confirmItem.title}” will be removed from the checklist.` : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (confirmItem) await remove(confirmItem);
        }}
      />
    </div>
  );
}
