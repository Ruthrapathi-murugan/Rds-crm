import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-fade-in flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <div className="relative">
        <div className="bg-primary/10 absolute inset-0 scale-150 rounded-full blur-xl" aria-hidden="true" />
        <div className="bg-primary/10 text-primary relative flex size-12 items-center justify-center rounded-2xl">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
      {action}
    </div>
  );
}
