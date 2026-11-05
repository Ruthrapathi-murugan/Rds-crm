import { cn } from "@/lib/utils";

/** Label/value grid for record detail pages. Empty values show an em dash. */
export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: React.ReactNode; wide?: boolean }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className={cn("flex min-w-0 flex-col gap-1", item.wide && "sm:col-span-full")}>
          <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{item.label}</dt>
          <dd className="text-sm break-words whitespace-pre-wrap">
            {item.value === null || item.value === undefined || item.value === "" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
