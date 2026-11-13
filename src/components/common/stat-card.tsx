import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";

export function StatCard({
  label,
  value,
  format = "number",
  icon: Icon,
  hint,
  href,
  accent = "primary",
}: {
  label: string;
  value: number;
  format?: "number" | "inr" | "inr-compact" | "percent";
  icon: LucideIcon;
  hint?: React.ReactNode;
  href?: string;
  accent?: "primary" | "success" | "warning" | "danger" | "info";
}) {
  const accents = {
    primary: "bg-brand text-white shadow-glow",
    success: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    danger: "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    info: "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  } as const;

  const content = (
    <Card className={cn("group/stat relative h-full gap-3 overflow-hidden p-5", href && "hover-lift")}>
      {/* Soft brand glow in the corner that brightens on hover. */}
      <div
        aria-hidden="true"
        className="bg-brand pointer-events-none absolute -top-12 -right-12 size-36 rounded-full opacity-[0.08] blur-2xl transition-opacity duration-500 group-hover/stat:opacity-25"
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 ease-out group-hover/stat:scale-110 group-hover/stat:-rotate-6",
            accents[accent],
          )}
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
      </div>
      <CountUp value={value} format={format} className="relative text-[1.65rem] leading-none font-semibold tracking-tight" />
      {hint && <p className="text-muted-foreground relative text-xs">{hint}</p>}
    </Card>
  );

  return href ? (
    <Link href={href} className="focus-visible:ring-ring/50 block h-full rounded-2xl outline-none focus-visible:ring-[3px]">
      {content}
    </Link>
  ) : (
    content
  );
}
