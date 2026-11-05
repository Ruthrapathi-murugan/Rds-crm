import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Card frame for a server-rendered table that scrolls horizontally on small screens. */
export function DataCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={cn("gap-0 overflow-hidden p-0 [&_[data-slot=table-container]]:overflow-x-auto", className)}>{children}</Card>;
}
