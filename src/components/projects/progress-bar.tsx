"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Progress bar that grows from zero on first paint and glides between values.
 * Completed work turns green; the percentage is exposed to assistive tech.
 */
export function ProgressBar({
  value,
  label = "Progress",
  size = "sm",
  tone,
  className,
}: {
  value: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  tone?: "primary" | "success" | "danger";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  const resolvedTone = tone ?? (clamped >= 100 ? "success" : "primary");
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn(
        "bg-muted relative w-full overflow-hidden rounded-full",
        size === "sm" && "h-1.5",
        size === "md" && "h-2",
        size === "lg" && "h-3",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none",
          resolvedTone === "primary" && "bg-primary",
          resolvedTone === "success" && "bg-emerald-500",
          resolvedTone === "danger" && "bg-destructive",
        )}
        style={{ width: `${shown}%` }}
      />
    </div>
  );
}
