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
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-700",
    warning: "bg-amber-500/10 text-amber-700",
    danger: "bg-red-500/10 text-red-700",
    info: "bg-sky-500/10 text-sky-700",
  } as const;

  const content = (
    <Card className={cn("relative h-full gap-3 overflow-hidden p-5", href && "hover-lift")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", accents[accent])}>
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
      </div>
      <CountUp value={value} format={format} className="text-2xl font-semibold tracking-tight" />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </Card>
  );

  return href ? (
    <Link href={href} className="focus-visible:ring-ring/50 block h-full rounded-xl outline-none focus-visible:ring-[3px]">
      {content}
    </Link>
  ) : (
    content
  );
}
