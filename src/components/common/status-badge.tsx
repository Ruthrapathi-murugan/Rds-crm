import type { Tone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  neutral: { badge: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" },
  info: { badge: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  primary: { badge: "bg-indigo-50 text-indigo-800 ring-indigo-200", dot: "bg-indigo-500" },
  success: { badge: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  warning: { badge: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-500" },
  danger: { badge: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
  violet: { badge: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
  muted: { badge: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground/50" },
};

/** Status pill: coloured dot plus the text label, so colour never stands alone. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const classes = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        classes.badge,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", classes.dot)} />
      {children}
    </span>
  );
}

/** Convenience wrapper for enum statuses with label and tone maps. */
export function EnumBadge<T extends string>({
  value,
  labels,
  tones,
  className,
}: {
  value: T;
  labels: Record<T, string>;
  tones: Record<T, Tone>;
  className?: string;
}) {
  return (
    <StatusBadge tone={tones[value] ?? "neutral"} className={className}>
      {labels[value] ?? value}
    </StatusBadge>
  );
}
