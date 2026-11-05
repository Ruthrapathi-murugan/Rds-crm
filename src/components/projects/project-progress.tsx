"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { api, toastError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { ProgressBar } from "./progress-bar";

const QUICK = [0, 25, 50, 75, 100];

/**
 * Large progress bar with a quick slider. Changes save automatically shortly
 * after the user stops dragging; the bar follows the slider immediately.
 */
export function ProjectProgress({
  projectId,
  progress,
  editable,
  lockedReason,
}: {
  projectId: string;
  progress: number;
  editable: boolean;
  lockedReason?: string;
}) {
  const router = useRouter();
  const sliderId = useId();
  const [value, setValue] = useState(progress);
  const [saved, setSaved] = useState(progress);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [prevProgress, setPrevProgress] = useState(progress);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow server updates (e.g. completing the project sets 100%).
  if (progress !== prevProgress) {
    setPrevProgress(progress);
    setValue(progress);
    setSaved(progress);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function schedule(next: number) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 600);
  }

  async function save(next: number) {
    if (next === saved) return;
    setState("saving");
    try {
      await api(`/api/projects/${projectId}/progress`, { method: "PATCH", body: { progress: next } });
      setSaved(next);
      setState("saved");
      router.refresh();
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch (error) {
      setValue(saved);
      setState("idle");
      toastError(error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
          <span className="text-muted-foreground text-lg">%</span>
        </p>
        <p className="text-muted-foreground flex h-5 items-center gap-1.5 text-xs" aria-live="polite">
          {state === "saving" && (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Saving…
            </>
          )}
          {state === "saved" && (
            <span className="animate-fade-in inline-flex items-center gap-1 text-emerald-700">
              <Check className="size-3.5" aria-hidden="true" /> Saved
            </span>
          )}
        </p>
      </div>
      {editable ? (
        <div className="flex flex-col gap-3">
          {/* The bar is the slider: a transparent range input sits over it, with a visible thumb. */}
          <div className="group/slider relative py-1.5">
            <ProgressBar value={value} size="lg" label="Project progress" />
            <span
              aria-hidden="true"
              className="border-primary bg-background pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition-[left,transform] duration-300 ease-out group-hover/slider:scale-110 group-has-[:focus-visible]/slider:ring-[3px] group-has-[:focus-visible]/slider:ring-ring/50 motion-reduce:transition-none"
              style={{ left: `${value}%` }}
            />
            <label htmlFor={sliderId} className="sr-only">
              Set progress
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={value}
              onChange={(e) => schedule(Number(e.target.value))}
              aria-valuetext={`${value}%`}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick progress">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => schedule(q)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs tabular-nums transition-colors",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  value === q ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                )}
              >
                {q}%
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <ProgressBar value={value} size="lg" label="Project progress" />
          {lockedReason && <p className="text-muted-foreground text-xs">{lockedReason}</p>}
        </>
      )}
    </div>
  );
}
